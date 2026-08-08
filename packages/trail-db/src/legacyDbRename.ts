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
}

export interface ResolvedDbFile {
  /** open すべきパス。リネーム失敗時は旧名パスに倒れる。 */
  readonly path: string;
  /** 旧名 → 新名の物理リネームを実施したか。 */
  readonly renamed: boolean;
}

/**
 * -wal / -shm はベースファイル名に紐づくため、ベースだけ改名すると直近コミットの
 * 取り残し（WAL 未反映分の消失）につながる。3 点セットで扱う。
 */
const SIDECAR_SUFFIXES = ['', '-wal', '-shm'] as const;

/**
 * DB ファイル名変更（2026-08-08: trail.db→activity.db / memory-core.db→caravan-book.db /
 * doc-core.db→catalog.db）のレガシー移行。**DB の owner（open して書き込むプロセス）だけが
 * 呼ぶ**。サイドカー（mcp-trail 等）は物理リネームせずフォールバック解決に留める —
 * 旧ビルドの拡張が稼働中に別プロセスが改名すると、旧ビルドが空の旧名 DB を再作成する
 * split-brain になるため。
 *
 * - 新名が実在すれば何もしない（旧名が残っていても上書きしない）
 * - 旧名だけ実在すれば -wal / -shm ごと新名へ rename する
 * - rename が途中で失敗したら実施済み分を巻き戻し、旧名パスを返して動作を継続する
 *   （fail-open。移行できない環境でもデータへの到達性を優先し、warn で観測可能にする）
 */
export function resolveDbWithLegacyRename(opts: ResolveDbWithLegacyRenameOptions): ResolvedDbFile {
  const currentPath = path.join(opts.dir, opts.current);
  const legacyPath = path.join(opts.dir, opts.legacy);
  if (fs.existsSync(currentPath)) return { path: currentPath, renamed: false };
  if (!fs.existsSync(legacyPath)) return { path: currentPath, renamed: false };

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
    for (const { from, to } of [...done].reverse()) {
      try {
        rename(to, from);
      } catch (rollbackError) {
        opts.warn(
          `[legacyDbRename] rollback failed for ${to} -> ${from}: ${String(
            rollbackError instanceof Error ? rollbackError.message : rollbackError,
          )}`,
        );
      }
    }
    opts.warn(
      `[legacyDbRename] failed to rename ${opts.legacy} -> ${opts.current} in ${opts.dir}: ${String(
        e instanceof Error ? e.message : e,
      )}; keep using ${opts.legacy}`,
    );
    return { path: legacyPath, renamed: false };
  }
}
