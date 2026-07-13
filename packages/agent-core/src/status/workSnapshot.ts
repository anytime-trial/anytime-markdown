import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** ref 名前空間。git の既定 push refspec（refs/heads/*）に含まれないため、意図せず共有されない。 */
export const SNAPSHOT_REF_ROOT = 'refs/anytime/snapshots';

export interface WorkSnapshot {
  /** 例: refs/anytime/snapshots/anytime-markdown-1a2b3c/20260713T050000Z */
  readonly ref: string;
  /** スナップショット commit の SHA */
  readonly sha: string;
  /** ツリー SHA。前回との同一判定に使う */
  readonly tree: string;
  /** UTC ISO 8601。ref 名の timestamp から復元する */
  readonly createdAt: string;
  /** スナップショットに含まれる未コミット変更の件数（git status --porcelain の行数） */
  readonly fileCount: number;
}

export interface CreateWorkSnapshotResult {
  readonly snapshot: WorkSnapshot | null;
  /** snapshot が null のときの理由。'clean' = 失うものが無い / 'unchanged' = 前回と同一内容 */
  readonly skipped: 'clean' | 'unchanged' | null;
}

function git(repoRoot: string, args: readonly string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  }).trim();
}

/**
 * ref は worktree 間で共有される（refs/ は common dir にある）ため、worktree ごとに名前空間を分ける。
 * パスをそのまま使うとスラッシュが ref 階層に化けるので、basename + パスの短縮ハッシュで一意にする。
 */
export function worktreeSlug(repoRoot: string): string {
  const base = (repoRoot.split('/').filter((s) => s !== '').at(-1) ?? 'repo').replace(
    /[^\w.-]/g,
    '_',
  );
  const hash = createHash('sha1').update(repoRoot).digest('hex').slice(0, 6);
  return `${base}-${hash}`;
}

/** UTC ISO 8601 → ref 名で使う圧縮形（20260713T050000Z）。 */
export function toRefTimestamp(iso: string): string {
  return iso.replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** ref 名の圧縮 timestamp → UTC ISO 8601。 */
export function fromRefTimestamp(stamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!m) return stamp;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

function headSha(repoRoot: string): string | null {
  try {
    return git(repoRoot, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    // 初コミット前のリポジトリでは HEAD が解決できない。親なし commit を作るため null を返す。
    return null;
  }
}

function latestTree(repoRoot: string): string | null {
  const out = git(repoRoot, [
    'for-each-ref',
    '--sort=-refname',
    '--count=1',
    '--format=%(tree)',
    `${SNAPSHOT_REF_ROOT}/${worktreeSlug(repoRoot)}/`,
  ]);
  return out === '' ? null : out;
}

/**
 * 未コミット作業を非破壊でスナップショットする。
 *
 * 作業ツリーにも本物の index にも書き込まない。git add / stash / checkout は一切実行せず、
 * GIT_INDEX_FILE で隔離した一時 index の上でのみ操作する。この制約が本関数の存在理由であり、
 * 破ると「事故防止機構が事故そのものになる」。
 */
export function createWorkSnapshot(repoRoot: string, nowIso: string): CreateWorkSnapshotResult {
  const status = git(repoRoot, ['status', '--porcelain']);
  if (status === '') return { snapshot: null, skipped: 'clean' };
  const fileCount = status.split('\n').filter((l) => l !== '').length;

  const gitDir = git(repoRoot, ['rev-parse', '--absolute-git-dir']);
  const tmpIndex = join(gitDir, 'anytime-work-snapshot-index');
  const realIndex = join(gitDir, 'index');

  try {
    rmSync(tmpIndex, { force: true });
    // 本物の index を出発点にすることで staged 状態を保つ。存在しなければ空 index から始める。
    if (existsSync(realIndex)) copyFileSync(realIndex, tmpIndex);

    const indexEnv = { GIT_INDEX_FILE: tmpIndex };
    git(repoRoot, ['add', '-A'], indexEnv);
    const tree = git(repoRoot, ['write-tree'], indexEnv);

    if (tree === latestTree(repoRoot)) return { snapshot: null, skipped: 'unchanged' };

    const parent = headSha(repoRoot);
    const commitArgs = ['commit-tree', tree];
    if (parent !== null) commitArgs.push('-p', parent);
    commitArgs.push('-m', `anytime: work snapshot ${nowIso} (${fileCount} files)`);

    // identity と日時を明示する。リポジトリの user.email 未設定でも失敗せず、テストで決定的になる。
    const sha = git(repoRoot, commitArgs, {
      GIT_AUTHOR_NAME: 'Anytime Agent',
      GIT_AUTHOR_EMAIL: 'agent@anytime.local',
      GIT_COMMITTER_NAME: 'Anytime Agent',
      GIT_COMMITTER_EMAIL: 'agent@anytime.local',
      GIT_AUTHOR_DATE: nowIso,
      GIT_COMMITTER_DATE: nowIso,
    });

    const ref = `${SNAPSHOT_REF_ROOT}/${worktreeSlug(repoRoot)}/${toRefTimestamp(nowIso)}`;
    git(repoRoot, ['update-ref', ref, sha]);

    return { snapshot: { ref, sha, tree, createdAt: nowIso, fileCount }, skipped: null };
  } finally {
    rmSync(tmpIndex, { force: true });
  }
}

/** 新しい順にスナップショットを列挙する。台帳は git の ref そのものであり、DB は持たない。 */
export function listWorkSnapshots(repoRoot: string): readonly WorkSnapshot[] {
  const prefix = `${SNAPSHOT_REF_ROOT}/${worktreeSlug(repoRoot)}/`;
  const out = git(repoRoot, [
    'for-each-ref',
    '--sort=-refname',
    '--format=%(refname)%09%(objectname)%09%(tree)%09%(subject)',
    prefix,
  ]);
  if (out === '') return [];

  return out
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [ref, sha, tree, subject = ''] = line.split('\t');
      const stamp = ref.slice(prefix.length);
      const countMatch = /\((\d+) files\)$/.exec(subject);
      return {
        ref,
        sha,
        tree,
        createdAt: fromRefTimestamp(stamp),
        fileCount: countMatch ? Number.parseInt(countMatch[1], 10) : 0,
      };
    });
}

/**
 * cutoff（UTC ISO）より古いスナップショットの ref を削除する。
 * 対象は自ワークツリーの名前空間のみ（listWorkSnapshots が prefix で絞る）。
 * @returns 削除した件数
 */
export function pruneWorkSnapshots(repoRoot: string, cutoffIso: string): number {
  const stale = listWorkSnapshots(repoRoot).filter((s) => s.createdAt < cutoffIso);
  for (const s of stale) {
    git(repoRoot, ['update-ref', '-d', s.ref]);
  }
  return stale.length;
}

/**
 * 任意のディレクトリから git リポジトリのルートを解決する。git リポジトリでなければ null。
 * git の呼び出しを本モジュールへ閉じるため、拡張ホスト側から直接 git を叩かせない。
 */
export function resolveRepoRoot(cwd: string): string | null {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']);
  } catch {
    // git リポジトリでない場合、git は非ゼロ終了する。呼び出し側は機能を無効化すればよい。
    return null;
  }
}

/**
 * 復元コマンドを組み立てる。**実行はしない。**
 * 復元は作業ツリーを上書きする破壊的操作であり、「消えたと思ったが意図的に消していた」場合に
 * 二次被害を生む。提示までに留め、実行はユーザーに委ねる。
 */
export function restoreCommand(snapshot: WorkSnapshot): string {
  return `git restore --source=${snapshot.sha} --worktree -- .`;
}
