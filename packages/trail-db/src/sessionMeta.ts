import * as fs from 'node:fs';

const WORKTREE_SEGMENTS = new Set(['.worktrees', '.claude-worktrees']);

// 末尾スラッシュ除去。`/\/+$/` 正規表現は末尾アンカー + 量指定子で polynomial-ReDoS
// (CodeQL js/polynomial-redos / Sonar S5852) になるため、線形スキャンで除去する。
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 47 /* '/' */) end--;
  return value.slice(0, end);
}

/**
 * cwd から上位へ遡り、`.git`（通常リポジトリはディレクトリ、worktree チェックアウトは
 * ファイル）を持つ最初のディレクトリを返す。見つからない・パスが既に存在しない場合は null。
 *
 * ワークスペース名はリポジトリ単位で決まるべきなので、`packages/web-app` のような
 * サブディレクトリで起動したセッションを親リポジトリへ帰属させるために使う。
 */
function findGitRoot(dir: string, exists: (p: string) => boolean): string | null {
  let current = dir;
  while (current !== '' && current !== '/') {
    if (exists(`${current}/.git`)) return current;
    const idx = current.lastIndexOf('/');
    if (idx < 0) return null;
    current = current.slice(0, idx);
  }
  return null;
}

function deriveRepoNameFromCwd(
  cwd: string,
  exists: (p: string) => boolean = fs.existsSync,
): string | null {
  const trimmed = stripTrailingSlashes(cwd);
  if (trimmed === '' || trimmed === '/') return null;

  // git ルートまで畳んでから basename を取る。ルートを解決できない場合（インポート時点で
  // パスが消えている等）は cwd そのものを使う従来挙動へフォールバックする。
  const resolved = findGitRoot(trimmed, exists) ?? trimmed;
  const segments = resolved.split('/').filter((s) => s !== '');
  if (segments.length === 0) return null;

  // worktree 直下 (.worktrees/<name> or .claude-worktrees/<name>) は親 repo に正規化する
  for (let i = segments.length - 1; i >= 1; i--) {
    if (WORKTREE_SEGMENTS.has(segments[i] ?? '')) {
      return segments[i - 1] ?? null;
    }
  }

  return segments.at(-1) ?? null;
}

/**
 * JSONL から最初に見つかった `cwd` フィールドを取り、worktree を親 repo に正規化したうえで
 * basename を返す。取れない場合 null。
 *
 * 用途: TrailDatabase.importAll で sessions.repo_name を JSONL の本物の作業 cwd 由来に
 * stamp するため。詳細は plan/20260518-sessions-repo-name-from-cwd.ja.md 参照。
 */
export function extractRepoNameFromJsonl(filePath: string): string | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  for (const raw of lines) {
    if (raw.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const cwd = (parsed as { cwd?: unknown }).cwd;
    if (typeof cwd !== 'string') continue;
    const derived = deriveRepoNameFromCwd(cwd);
    if (derived !== null) return derived;
    // cwd はあるが basename を取れない (`/` 等) → 次の行を見る
  }
  return null;
}

// Claude Code の projects ディレクトリ名は cwd の `/` を `-` へ潰した平坦化名
// （`/anytime-markdown/packages/web-app` → `-anytime-markdown-packages-web-app`）。
// `-` がセグメント区切りか名前中のハイフンかは名前だけでは決まらないため、
// ファイルシステム上に実在するパスだけを辿って復元する。
const MAX_PROJECT_DIR_TOKENS = 12;
const MAX_PROJECT_DIR_PROBES = 512;

/**
 * トークン列を「実在するディレクトリ」の連なりへ分割する候補を集める。セグメント境界でのみ
 * 存在確認するため、`/anytime` のような途中経過は探索されない。候補が 2 つ以上（＝復元が
 * 一意でない）と分かった時点で打ち切る。
 */
function collectCandidatePaths(
  tokens: readonly string[],
  start: number,
  prefix: string,
  exists: (p: string) => boolean,
  out: string[],
  probes: { count: number },
): void {
  if (start >= tokens.length) {
    out.push(prefix);
    return;
  }
  let segment = '';
  for (let end = start; end < tokens.length; end++) {
    segment = segment === '' ? (tokens[end] ?? '') : `${segment}-${tokens[end] ?? ''}`;
    if (probes.count >= MAX_PROJECT_DIR_PROBES) return;
    probes.count++;
    const candidate = `${prefix}/${segment}`;
    if (!exists(candidate)) continue;
    collectCandidatePaths(tokens, end + 1, candidate, exists, out, probes);
    if (out.length > 1) return;
  }
}

/**
 * セッションの JSONL パスに含まれる `.claude/projects/<dir>/` の `<dir>` から元の cwd を
 * 復元し、リポジトリ名を返す。JSONL 本体が既に消えていて cwd を読めない場合の補助。
 *
 * 復元が一意に定まらない（候補 0 件 or 2 件以上）場合は null を返す。推測でリポジトリ名を
 * 作らないことを優先する（誤った帰属を作るより未解決のままにする）。
 */
export function extractRepoNameFromProjectDirPath(
  filePath: string,
  exists: (p: string) => boolean = fs.existsSync,
): string | null {
  const dirName = /\/projects\/([^/]+)\//.exec(filePath)?.[1]?.replace(/^-+/, '');
  if (!dirName) return null;
  const tokens = dirName.split('-').filter((t) => t !== '');
  if (tokens.length === 0 || tokens.length > MAX_PROJECT_DIR_TOKENS) return null;

  const candidates: string[] = [];
  collectCandidatePaths(tokens, 0, '', exists, candidates, { count: 0 });
  if (candidates.length !== 1) return null;
  return deriveRepoNameFromCwd(candidates[0] ?? '', exists);
}

// 正規化の実体は trail-core（viewer と共有する単一の正）。trail-db の既存利用箇所
// （TrailDatabase.getCombinedData・テスト）向けに再エクスポートする。
export { normalizeWorkspaceName } from '@anytime-markdown/trail-core/domain';

// テストから直接検証したい場合に備えて export
export const __internal = { deriveRepoNameFromCwd };
