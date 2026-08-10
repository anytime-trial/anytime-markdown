import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResolveDbWithLegacyRenameOptions {
  /** DB ファイルが置かれるディレクトリ（絶対パス）。 */
  readonly dir: string;
  /** 新しいファイル名（例: activity.db）。 */
  readonly current: string;
  /** 旧ファイル名（例: trail.db）。 */
  readonly legacy: string;
  /**
   * 警告の通知先。呼び出し側で必ず配線する（no-op 既定値は禁止 — リネーム失敗が
   * どこにも出ないと、旧名のまま動き続ける理由を誰も観測できない）。
   */
  readonly warn: (message: string) => void;
  /** テスト用の rename 差し替え。 */
  readonly renameFn?: (from: string, to: string) => void;
  /** ロック解放待ちの上限 ms（テスト用。既定 2000）。 */
  readonly lockWaitTotalMs?: number;
}

export interface ResolvedDbFile {
  /** open すべきパス。リネーム失敗・ロック競合時は実在する側に倒れる。 */
  readonly path: string;
  /** 旧名 → 新名の物理リネームを実施したか。 */
  readonly renamed: boolean;
}

/**
 * -wal / -shm はベースファイル名に紐づくため、ベースだけ改名すると直近コミットの
 * 取り残し（WAL 未反映分の消失）につながる。3 点セットで扱う。
 */
const SIDECAR_SUFFIXES = ['', '-wal', '-shm'] as const;

/** これより古いロックはクラッシュ残骸（stale）とみなして除去する。 */
const LOCK_STALE_MS = 60_000;
const LOCK_POLL_MS = 50;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function preferExisting(currentPath: string, legacyPath: string): string {
  if (fs.existsSync(currentPath)) return currentPath;
  if (fs.existsSync(legacyPath)) return legacyPath;
  return currentPath;
}

/**
 * `wx` の排他生成でリネームロックを取得する。取得できない間は解放（ファイル消滅）を
 * 上限まで待つ。mtime が LOCK_STALE_MS より古いロックはクラッシュ残骸として除去して
 * 取り直す。取得できなければ null（呼び出し側は移行を見送り実在する側を開く）。
 */
function acquireRenameLock(
  lockPath: string,
  waitTotalMs: number,
  warn: (message: string) => void,
): number | null {
  const deadline = Date.now() + waitTotalMs;
  for (;;) {
    try {
      return fs.openSync(lockPath, 'wx');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        warn(`[legacyDbRename] rename lock open failed at ${lockPath}: ${String(e)}`);
        return null;
      }
    }
    try {
      const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (ageMs > LOCK_STALE_MS) {
        warn(`[legacyDbRename] removing stale rename lock (${Math.round(ageMs / 1000)}s old) at ${lockPath}`);
        fs.rmSync(lockPath, { force: true });
        continue;
      }
    } catch {
      // ロックが消えた（保持者が解放した）直後は取り直しへ進む。
      continue;
    }
    if (Date.now() >= deadline) return null;
    sleepSync(LOCK_POLL_MS);
  }
}

/**
 * 実施済みリネームを逆順に巻き戻す。巻き戻し自体の失敗は握り潰さず warn へ出す
 * （途中状態のまま止めるより、観測可能にしたうえで残りの巻き戻しを続ける方が安全）。
 */
function rollbackRenames(
  done: readonly { from: string; to: string }[],
  rename: (from: string, to: string) => void,
  warn: (message: string) => void,
): void {
  for (const { from, to } of [...done].reverse()) {
    try {
      rename(to, from);
    } catch (rollbackError) {
      warn(
        `[legacyDbRename] rollback failed for ${to} -> ${from}: ${String(
          rollbackError instanceof Error ? rollbackError.message : rollbackError,
        )}`,
      );
    }
  }
}

function renameLegacyFiles(
  currentPath: string,
  legacyPath: string,
  opts: ResolveDbWithLegacyRenameOptions,
): ResolvedDbFile {
  const rename = opts.renameFn ?? fs.renameSync;
  const done: Array<{ from: string; to: string }> = [];
  try {
    for (const suffix of SIDECAR_SUFFIXES) {
      const from = legacyPath + suffix;
      if (!fs.existsSync(from)) continue;
      const to = currentPath + suffix;
      rename(from, to);
      done.push({ from, to });
    }
    opts.warn(`[legacyDbRename] renamed ${opts.legacy} -> ${opts.current} in ${opts.dir}`);
    return { path: currentPath, renamed: true };
  } catch (e) {
    // 旧ビルドの owner 等、ロックを知らないプロセスが先に移設を終えた場合は新名を使う
    // （消えた旧名パスへ倒すと、存在しないパスに空 DB を新規作成する事故になる）。
    if (!fs.existsSync(legacyPath) && fs.existsSync(currentPath) && done.length === 0) {
      opts.warn(
        `[legacyDbRename] ${opts.legacy} was already migrated by another process; using ${opts.current}`,
      );
      return { path: currentPath, renamed: false };
    }
    rollbackRenames(done, rename, opts.warn);
    opts.warn(
      `[legacyDbRename] failed to rename ${opts.legacy} -> ${opts.current} in ${opts.dir}: ${String(
        e instanceof Error ? e.message : e,
      )}; keep using ${preferExisting(currentPath, legacyPath)}`,
    );
    return { path: preferExisting(currentPath, legacyPath), renamed: false };
  }
}

/**
 * DB ファイル名変更（2026-08-08: trail.db→activity.db / memory-core.db→caravan-book.db /
 * doc-core.db→catalog.db）のレガシー移行。**DB の owner（open して書き込むプロセス）だけが
 * 呼ぶ**。サイドカー（mcp-trail 等）は物理リネームせずフォールバック解決に留める —
 * 旧ビルドの拡張が稼働中に別プロセスが改名すると、旧ビルドが空の旧名 DB を再作成する
 * split-brain になるため。
 *
 * - 新名が実在すれば何もしない（旧名が残っていても上書きしない）
 * - 旧名だけ実在すれば -wal / -shm ごと新名へ rename する
 * - owner は複数プロセスになり得る（trail 拡張 / database 拡張 / daemon / CLI）ため、
 *   `<current>.rename-lock` の排他生成でリネーム全体を直列化する。ロックを取得できない
 *   プロセスは移行を見送り、その時点で実在する側を開く（fail-open。次回 open が再試行）
 * - rename が途中で失敗したら実施済み分を巻き戻し、実在する側のパスを返して動作を継続する
 *   （fail-open。移行できない環境でもデータへの到達性を優先し、warn で観測可能にする）
 */
export function resolveDbWithLegacyRename(opts: ResolveDbWithLegacyRenameOptions): ResolvedDbFile {
  const currentPath = path.join(opts.dir, opts.current);
  const legacyPath = path.join(opts.dir, opts.legacy);
  if (fs.existsSync(currentPath)) return { path: currentPath, renamed: false };
  if (!fs.existsSync(legacyPath)) return { path: currentPath, renamed: false };

  const lockPath = `${currentPath}.rename-lock`;
  const lockFd = acquireRenameLock(lockPath, opts.lockWaitTotalMs ?? 2000, opts.warn);
  if (lockFd === null) {
    opts.warn(
      `[legacyDbRename] rename lock busy at ${lockPath}; skip migration this time (retried on next open)`,
    );
    return { path: preferExisting(currentPath, legacyPath), renamed: false };
  }
  try {
    // ロック取得までの間に他 owner が移設を終えた可能性があるため再判定する。
    if (fs.existsSync(currentPath)) return { path: currentPath, renamed: false };
    if (!fs.existsSync(legacyPath)) return { path: currentPath, renamed: false };
    return renameLegacyFiles(currentPath, legacyPath, opts);
  } finally {
    try {
      fs.closeSync(lockFd);
      fs.rmSync(lockPath, { force: true });
    } catch (releaseError) {
      opts.warn(`[legacyDbRename] rename lock release failed at ${lockPath}: ${String(releaseError)}`);
    }
  }
}
