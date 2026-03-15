/**
 * Mermaid %%{init: ...}%% ディレクティブの抽出・合成ユーティリティ
 */

const INIT_DIRECTIVE_RE = /^%%\{init:\s*([\s\S]*?)\}%%\s*/;

/**
 * コード先頭の %%{init: ...}%% ディレクティブを分離する。
 * ディレクティブがなければ config は空文字を返す。
 */
export function extractMermaidConfig(code: string): { config: string; body: string } {
  const match = code.match(INIT_DIRECTIVE_RE);
  if (!match) return { config: "", body: code };

  const rawJson = match[1].trim();
  const body = code.slice(match[0].length);
  return { config: rawJson, body };
}

/**
 * config JSON 文字列と body を結合してコード文字列に戻す。
 * config が空または空オブジェクト `{}` の場合はディレクティブを付与しない。
 */
export function mergeMermaidConfig(config: string, body: string): string {
  const trimmed = config.trim();
  if (!trimmed || trimmed === "{}") return body;
  return `%%{init: ${trimmed}}%%\n${body}`;
}
