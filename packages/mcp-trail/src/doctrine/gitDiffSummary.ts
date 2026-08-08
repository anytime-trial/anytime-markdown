import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** git 実行の既定タイムアウト。応答しない git でツール全体を止めないための上限 */
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GitCommitSummary {
  readonly sha: string;
  readonly subject: string;
}

export interface GitFileChange {
  readonly path: string;
  /** バイナリ変更は増減を数えられないため null */
  readonly insertions: number | null;
  readonly deletions: number | null;
}

export interface GitDiffSummary {
  readonly available: boolean;
  readonly baseRef: string;
  readonly headRef: string;
  readonly commits: readonly GitCommitSummary[];
  readonly files: readonly GitFileChange[];
  /** 取得できなかった理由。available=true のときは null */
  readonly degradedReason: string | null;
}

export interface GitDiffSummaryOptions {
  readonly cwd: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly timeoutMs?: number;
}

function parseCommits(stdout: string): GitCommitSummary[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const tab = line.indexOf('\t');
      return tab === -1
        ? { sha: line, subject: '' }
        : { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}

function parseCount(token: string | undefined): number | null {
  // numstat はバイナリ変更を `-` で出す（0 と区別する必要がある）
  if (token === undefined || token === '-') {
    return null;
  }
  const value = Number.parseInt(token, 10);
  return Number.isNaN(value) ? null : value;
}

function parseNumstat(stdout: string): GitFileChange[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [insertions, deletions, ...rest] = line.split('\t');
      return {
        path: rest.join('\t'),
        insertions: parseCount(insertions),
        deletions: parseCount(deletions),
      };
    });
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    // git の診断は stderr に出るため、あれば理由として優先する（message は
    // "Command failed" で終わることが多く、原因の特定に足りない）
    const stderr = (error as { stderr?: unknown }).stderr;
    const detail = typeof stderr === 'string' ? stderr.trim() : '';
    return detail === '' ? error.message : detail;
  }
  return String(error);
}

/**
 * 受け入れ確認の提示物 3（成果物の差分）を git から直接取得する（DCT-13）。
 *
 * 取込済みの `activity_session_commits` を使わないのは、Trail 拡張の取込にラグがあり
 * 完了報告の時点では当該セッションのコミットが未取込なのが通常であるため
 * （空を「差分なし」と読ませない。仕様 §4）。
 *
 * 差分は 3 点表記（merge base 起点）で取る。基準ブランチが先行していても
 * 他者の変更を混ぜないため。
 *
 * 失敗は例外にせず `available: false` + 理由で返す。差分 1 要素の失敗で残り
 * 3 要素の提示を失わせないため（仕様 §8）。
 */
export async function summarizeGitDiff(options: GitDiffSummaryOptions): Promise<GitDiffSummary> {
  const { cwd, baseRef, headRef } = options;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const { stdout: log } = await execFileAsync(
      'git',
      ['log', '--format=%h%x09%s', `${baseRef}..${headRef}`],
      { cwd, timeout },
    );
    const { stdout: numstat } = await execFileAsync(
      'git',
      ['diff', '--numstat', `${baseRef}...${headRef}`],
      { cwd, timeout },
    );
    return {
      available: true,
      baseRef,
      headRef,
      commits: parseCommits(log),
      files: parseNumstat(numstat),
      degradedReason: null,
    };
  } catch (error) {
    return {
      available: false,
      baseRef,
      headRef,
      commits: [],
      files: [],
      degradedReason: describeFailure(error),
    };
  }
}
