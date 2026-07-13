import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
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

/**
 * `--no-optional-locks` を必ず前置する。
 *
 * 素の `git status` は stat キャッシュ更新のために `.git/index.lock` を取り、**本物の index を書き換える**
 * （実測: status 実行前後で `.git/index` の mtime が変化する）。内容は変わらないが、
 * (1) 「本物の index に書き込まない」という本モジュールの不変条件を実行パスで破り、
 * (2) 15 分ごとにバックグラウンドで index.lock を奪うため、ユーザーやエージェントが同時に
 *     `git add` / `git commit` していると相手側を `Unable to create '.git/index.lock'` で失敗させ得る。
 * VS Code 組み込みの git 拡張が読み取り系に一律で本オプションを付けているのも同じ理由による。
 * `add`（一時 index 側）・`write-tree`・`commit-tree`・`update-ref` は必須ロックを使うため影響を受けない。
 */
function git(repoRoot: string, args: readonly string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', ['--no-optional-locks', ...args], {
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

/**
 * ref 名の圧縮 timestamp → UTC ISO 8601。形式に合わなければ null。
 *
 * 素通しで返してはならない。`20260713T050000Z` のまま `createdAt` に入ると、prune の文字列比較
 * （`createdAt < '2026-07-06T...'`）で `-`(0x2D) < `0`(0x30) となり **常に「新しい」と判定されて
 * 永久に prune されなくなる**。
 */
export function parseRefTimestamp(stamp: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

function headSha(repoRoot: string): string | null {
  try {
    return git(repoRoot, ['rev-parse', '--verify', 'HEAD']);
  } catch (err) {
    // 「初コミット前（unborn HEAD）」だけを親なし commit として許容する。リポジトリ破損・git 不在等の
    // 別種の失敗まで畳み込むと、親リンクを失った孤児スナップショットが黙って生まれる。
    // unborn HEAD は「HEAD は在るが指す先の commit が無い」状態なので、symbolic-ref は成功する。
    try {
      git(repoRoot, ['symbolic-ref', '--quiet', 'HEAD']);
      return null;
    } catch {
      throw err;
    }
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
  // -uall にする理由: 既定の -unormal は untracked ディレクトリを `?? sub/` の 1 行に折り畳むが、
  // `git add -A` は配下の全ファイルを取り込む。揃えないと fileCount が実件数より小さく出て
  // （50 ファイルの作業が「3 files」と表示される）、ユーザーの復元判断を誤らせる。
  const status = git(repoRoot, ['status', '--porcelain', '-uall']);
  if (status === '') return { snapshot: null, skipped: 'clean' };
  const fileCount = status.split('\n').filter((l) => l !== '').length;

  const gitDir = git(repoRoot, ['rev-parse', '--absolute-git-dir']);
  // 一時 index はプロセス固有にする。固定パスだと、同じリポジトリを開いた 2 つ目の VS Code が
  // こちらの使用中の一時 index を消し得る。その状態の write-tree は **例外を投げず空 tree を返す**
  // （実測: exit 0 で 4b825dc6...）ため、fail-open では捕捉できず「N files」と表示されるのに
  // 中身が空のスナップショットが最新として残る。復元を試みて初めて空だと分かる最悪の壊れ方になる。
  const tmpIndex = join(gitDir, `anytime-work-snapshot-index-${process.pid}-${randomUUID()}`);
  const realIndex = join(gitDir, 'index');

  try {
    // 本物の index を出発点にすることで staged 状態を保つ。存在しなければ空 index から始める。
    if (existsSync(realIndex)) copyFileSync(realIndex, tmpIndex);

    const indexEnv = { GIT_INDEX_FILE: tmpIndex };
    git(repoRoot, ['add', '-A'], indexEnv);

    // write-tree の直前で一時 index の実在を確認する（多重防御）。消えていると git は空 tree を
    // exit 0 で返すため、ここで落とさないと空のスナップショットが黙って作られる。
    if (!existsSync(tmpIndex)) {
      throw new Error(
        `一時 index が消失したためスナップショットを中止した: ${tmpIndex} (repo=${repoRoot})`,
      );
    }

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

  const snapshots: WorkSnapshot[] = [];
  for (const line of out.split('\n')) {
    if (line === '') continue;
    const [ref, sha, tree, subject = ''] = line.split('\t');
    const createdAt = parseRefTimestamp(ref.slice(prefix.length));
    // 本モジュールが作った ref なら必ずパースできる。できないものは手作り・破損の類なので
    // 一覧から外す。prune の対象にもならない（自分が作っていない ref を消すのは破壊的すぎる）。
    if (createdAt === null) continue;
    const countMatch = /\((\d+) files\)$/.exec(subject);
    snapshots.push({
      ref,
      sha,
      tree,
      createdAt,
      fileCount: countMatch ? Number.parseInt(countMatch[1], 10) : 0,
    });
  }
  return snapshots;
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
  // パススペックは `.`（cwd 相対）ではなく `:/`（リポジトリルート相対）にする。サブディレクトリの
  // ターミナルに貼られると `.` はそのサブツリーだけを復元し、部分復元に気づきにくい。
  return `git restore --source=${snapshot.sha} --worktree -- :/`;
}
