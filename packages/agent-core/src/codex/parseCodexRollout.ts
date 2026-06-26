// Codex rollout (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`) の純粋パーサ。
// FS 非依存。入力は呼び出し側（vscode-common の CodexSessionScanner）が部分読みした
// 文字列を受け取る。Codex は agent-status DB へ状態を POST しないため、rollout を
// 直接スキャンして「最終アクティビティ」と「コンテキストトークン」のみ抽出する。

export interface CodexSessionMeta {
  readonly sessionId: string;
  /** rollout 開始時の作業ディレクトリ（worktree 解決に使用） */
  readonly cwd: string;
  /** UTC ISO 8601。セッション開始時刻 */
  readonly startedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeParseLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // 部分読み（切り詰め）行や走査途中の壊れた行は無視して走査を続ける。
    return undefined;
  }
}

/**
 * 先頭 `session_meta` 行から sessionId / cwd / startedAt を抽出する。
 *
 * 入力契約: **改行まで含む完全な先頭行**。Codex の先頭行は `base_instructions.text`
 * を含み実測 22KB 級になるため、部分文字列を渡すと `JSON.parse` が失敗する。
 * type 不一致・必須欠落・パース失敗はいずれも `null` を返す。
 */
export function parseCodexSessionMeta(firstLine: string): CodexSessionMeta | null {
  const parsed = safeParseLine(firstLine);
  if (!isRecord(parsed) || parsed.type !== 'session_meta') {
    return null;
  }
  const payload = parsed.payload;
  if (!isRecord(payload)) {
    return null;
  }
  const sessionId = payload.id;
  const cwd = payload.cwd;
  if (typeof sessionId !== 'string' || sessionId === '' || typeof cwd !== 'string' || cwd === '') {
    return null;
  }
  // 開始時刻は payload.timestamp を優先し、無ければ行レベル timestamp にフォールバック。
  const payloadTs = typeof payload.timestamp === 'string' ? payload.timestamp : '';
  const lineTs = typeof parsed.timestamp === 'string' ? parsed.timestamp : '';
  return { sessionId, cwd, startedAt: payloadTs || lineTs };
}

function extractInputTokens(parsed: unknown): number | null {
  if (!isRecord(parsed) || parsed.type !== 'event_msg') {
    return null;
  }
  const payload = parsed.payload;
  if (!isRecord(payload) || payload.type !== 'token_count') {
    return null;
  }
  const info = payload.info;
  if (!isRecord(info)) {
    return null;
  }
  const last = info.last_token_usage;
  if (!isRecord(last)) {
    return null;
  }
  // context 占有量の近似 = 直近リクエストの input_tokens。
  // total_token_usage はセッション累計、cached_input_tokens は input_tokens の内数のため
  // どちらも使わない（Claude の「直近 assistant の input+cache_read+cache_creation」相当）。
  const input = last.input_tokens;
  return typeof input === 'number' ? input : null;
}

/**
 * tail テキストを行走査し、**最後に現れる** `token_count` イベントの
 * `info.last_token_usage.input_tokens` を返す。見つからなければ `null`
 * （不明＝⚠️バッジ判定から除外。0 と区別する）。
 */
export function extractCodexContextTokens(tailText: string): number | null {
  const lines = tailText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const tokens = extractInputTokens(safeParseLine(lines[i]));
    if (tokens !== null) {
      return tokens;
    }
  }
  return null;
}

/**
 * tail テキストの最後に現れる `timestamp`（最終アクティビティ）を ISO 文字列で返す。
 * 見つからなければ空文字。
 */
export function extractCodexLastActivity(tailText: string): string {
  const lines = tailText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = safeParseLine(lines[i]);
    if (isRecord(parsed) && typeof parsed.timestamp === 'string' && parsed.timestamp !== '') {
      return parsed.timestamp;
    }
  }
  return '';
}
