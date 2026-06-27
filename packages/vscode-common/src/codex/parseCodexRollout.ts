// agent-core `src/codex/parseCodexRollout.ts` のローカルミラー（同期必須）。
//
// vscode-common は agent-core を import しない（agent-core のバレルは node:sqlite を含み、
// CommonJS では vscode-common を消費する全拡張のバンドルに node:sqlite を巻き込むため。
// types.ts の AgentStatusSource コメント参照）。この純粋関数群は FS 非依存・依存ゼロのため、
// 境界を跨がず複製する。仕様の正本は agent-core 側（TDD 済み）。rollout 形式が変わったら両方更新する。

export interface CodexSessionMeta {
  readonly sessionId: string;
  readonly cwd: string;
  /** UTC ISO 8601。セッション開始時刻 */
  readonly startedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeParseLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** 先頭 `session_meta` 行から sessionId / cwd / startedAt を抽出。入力契約は改行まで含む完全な先頭行。 */
export function parseCodexSessionMeta(firstLine: string): CodexSessionMeta | null {
  const parsed = safeParseLine(firstLine);
  if (!isRecord(parsed) || parsed.type !== 'session_meta') return null;
  const payload = parsed.payload;
  if (!isRecord(payload)) return null;
  const sessionId = payload.id;
  const cwd = payload.cwd;
  if (typeof sessionId !== 'string' || sessionId === '' || typeof cwd !== 'string' || cwd === '') {
    return null;
  }
  const payloadTs = typeof payload.timestamp === 'string' ? payload.timestamp : '';
  const lineTs = typeof parsed.timestamp === 'string' ? parsed.timestamp : '';
  return { sessionId, cwd, startedAt: payloadTs || lineTs };
}

function extractInputTokens(parsed: unknown): number | null {
  if (!isRecord(parsed) || parsed.type !== 'event_msg') return null;
  const payload = parsed.payload;
  if (!isRecord(payload) || payload.type !== 'token_count') return null;
  const info = payload.info;
  if (!isRecord(info)) return null;
  const last = info.last_token_usage;
  if (!isRecord(last)) return null;
  const input = last.input_tokens;
  return typeof input === 'number' ? input : null;
}

/** tail を走査し最後の token_count の last_token_usage.input_tokens を返す。無ければ null（不明）。 */
export function extractCodexContextTokens(tailText: string): number | null {
  const lines = tailText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const tokens = extractInputTokens(safeParseLine(lines[i]));
    if (tokens !== null) return tokens;
  }
  return null;
}

/** tail の最後に現れる timestamp（最終アクティビティ）を返す。無ければ空文字。 */
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
