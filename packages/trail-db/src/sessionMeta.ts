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

export function deriveRepoNameFromCwd(
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
  probes: { count: number; truncated: boolean; max: number },
): void {
  if (start >= tokens.length) {
    out.push(prefix);
    return;
  }
  let segment = '';
  for (let end = start; end < tokens.length; end++) {
    segment = segment === '' ? (tokens[end] ?? '') : `${segment}-${tokens[end] ?? ''}`;
    // 上限で打ち切った探索は「候補が 1 件しか無い」ことの根拠にならない（未探索の枝に
    // 2 件目があり得る）。truncated を立てて呼び出し側で一意判定を放棄する。
    if (probes.count >= probes.max) {
      probes.truncated = true;
      return;
    }
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
 * 復元が一意に定まらない（候補 0 件 or 2 件以上、探索が上限で打ち切られた）場合は null を
 * 返す。推測でリポジトリ名を作らないことを優先する（誤った帰属を作るより未解決のまま残す）。
 *
 * 復元できるのはドットを含まないパスのみ。projects ディレクトリ名は `/` だけでなく `.` も
 * `-` へ潰すため、`/anytime-markdown/.worktrees/foo` のような cwd は候補 0 件になり現状維持と
 * なる（fail-closed）。JSONL が消えた worktree セッションが是正されないのはこのため。
 */
export function extractRepoNameFromProjectDirPath(
  filePath: string,
  exists: (p: string) => boolean = fs.existsSync,
  maxProbes: number = MAX_PROJECT_DIR_PROBES,
): string | null {
  const dirName = /\/projects\/([^/]+)\//.exec(filePath)?.[1]?.replace(/^-+/, '');
  if (!dirName) return null;
  const tokens = dirName.split('-').filter((t) => t !== '');
  if (tokens.length === 0 || tokens.length > MAX_PROJECT_DIR_TOKENS) return null;

  const candidates: string[] = [];
  const probes = { count: 0, truncated: false, max: maxProbes };
  collectCandidatePaths(tokens, 0, '', exists, candidates, probes);
  if (probes.truncated || candidates.length !== 1) return null;
  return deriveRepoNameFromCwd(candidates[0] ?? '', exists);
}

// 正規化の実体は trail-activity（viewer と共有する単一の正）。trail-db の既存利用箇所
// （TrailDatabase.getCombinedData・テスト）向けに再エクスポートする。
export { normalizeWorkspaceName } from '@anytime-markdown/trail-activity/domain';

// テストから直接検証したい場合に備えて export
export const __internal = { deriveRepoNameFromCwd };

// ---------------------------------------------------------------------------
//  Codex rollout の repo 帰属
// ---------------------------------------------------------------------------

/**
 * cwd を読み取れなかった Codex セッションに与える repo 名。
 *
 * Why not 主リポジトリ名へのフォールバック: Codex の rollout は `~/.codex/sessions` という
 * ホーム共有の 1 箇所へ全ワークスペース分が混ざって落ちる。帰属が不明な行に主リポジトリ名を
 * 与えると、他プロジェクトのセッションを自リポジトリのものとして数え、
 * `memory.workspaceScope: own` の記憶取込へ他プロジェクトの会話が混入する。
 */
export const CODEX_UNKNOWN_REPO_NAME = 'codex-unknown';

/** session_meta を探して読む先頭バイト数の上限。 */
const CODEX_META_SCAN_BYTES = 1024 * 1024;

/**
 * ファイル先頭から最大 maxBytes を読み、完全な行だけを返す（末尾の欠けた行は捨てる）。
 *
 * Why: Codex セッションは絞り込みなしに全件走査するため、rollout 全体を readFileSync すると
 * 1 回のパイプラインで 100MB 超を無駄に読む。session_meta は ordinal 0（先頭行）に置かれ、
 * 実測で約 19KB（base_instructions を含む）なので 1MiB あれば十分な余裕がある。
 */
function readLeadingCompleteLines(filePath: string, maxBytes: number): string[] {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    const lines = buf.subarray(0, bytesRead).toString('utf-8').split('\n');
    // maxBytes で切れた場合、最後の要素は行の途中なので JSON として壊れている。
    // ファイル末尾まで読み切った場合の最後の要素は空文字なので、どちらでも捨てて安全。
    if (bytesRead === maxBytes) lines.pop();
    return lines;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Codex rollout の `session_meta.payload.cwd` を返す。取れない場合 null。
 *
 * Claude Code の JSONL はトップレベルに `cwd` を持つため `extractRepoNameFromJsonl` が
 * そのまま使えるが、Codex は `payload` の下にネストするので別の取り出しが要る。
 */
export function readCodexSessionCwd(filePath: string): string | null {
  try {
    for (const line of readLeadingCompleteLines(filePath, CODEX_META_SCAN_BYTES)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec: unknown;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!rec || typeof rec !== 'object') continue;
      const r = rec as { type?: unknown; payload?: unknown };
      if (r.type !== 'session_meta' || !r.payload || typeof r.payload !== 'object') continue;
      const cwd = (r.payload as Record<string, unknown>).cwd;
      return typeof cwd === 'string' ? cwd : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Codex セッションの repo_name を決める。Claude Code セッションと同じ
 * `deriveRepoNameFromCwd`（git ルートまで遡り worktree を親へ畳む）を使うことで、
 * 同一プロジェクトの Claude / Codex セッションが同じ repo_name へ入る。
 */
export function resolveCodexRepoName(cwd: string | null): string {
  if (cwd === null) return CODEX_UNKNOWN_REPO_NAME;
  return deriveRepoNameFromCwd(cwd) ?? CODEX_UNKNOWN_REPO_NAME;
}
