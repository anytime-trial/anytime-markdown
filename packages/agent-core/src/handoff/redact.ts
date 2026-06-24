// handoff/redact.ts — handoff payload 書き出し前の保険的な秘密情報マスキング。
// OSS recall（MIT）の redact.py を TypeScript へ移植。保守的（過剰検出より取りこぼし防止優先）。
//
// 目的: summary 列・handoff doc・クリップボードに API キーや .env 値を載せないこと。

const R = '[REDACTED]';

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, R], // OpenAI/Anthropic 系 API キー
  [/\bAKIA[0-9A-Z]{16}\b/g, R], // AWS access key id
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, R], // GitHub token
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, R], // Slack token
  [/\b(authorization|bearer)\b\s*[:=]?\s*[A-Za-z0-9._~+/-]{12,}=*/gi, `$1 ${R}`],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g, R], // JWT
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, R],
];

// SECRET/TOKEN/PASSWORD/API_KEY 等を含む env 行の値を伏字化する。
const ENV_LINE =
  /^([ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*)[ \t]*=[ \t]*.+$/gim;

/** 与えられたテキストから秘密情報を伏字化する。空文字はそのまま返す。 */
export function redact(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out.replace(ENV_LINE, `$1=${R}`);
}
