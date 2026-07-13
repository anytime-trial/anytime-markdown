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

// env 行（`NAME=値`）の構造抽出。名前の中身は問わない。
// 名前とキーワードの照合を 1 本の正規表現に畳み込む（`[A-Z0-9_]*(?:SECRET|...)[A-Z0-9_]*`）と、
// `=` を持たない長い大文字行に対して量指定子が二重にバックトラックし O(n^2) になる
// （CodeQL js/polynomial-redos #948）。構造抽出と秘密名判定を二段に分ける。
const ENV_ASSIGN = /^([ \t]*(?:export[ \t]+)?[A-Z0-9_]+)[ \t]*=[ \t]*.+$/gim;
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY/i;

/** 与えられたテキストから秘密情報を伏字化する。空文字はそのまま返す。
 *  注: PATTERNS は `g` フラグ付きで静的格納するが、`String.replace` は呼び出し毎に lastIndex を
 *  リセットするため再利用は安全。将来 `.exec()` に変える場合は lastIndex の取り扱いに注意。 */
export function redact(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [re, repl] of PATTERNS) out = out.replace(re, repl);
  return out.replace(ENV_ASSIGN, (line, name: string) => (SECRET_NAME.test(name) ? `${name}=${R}` : line));
}
