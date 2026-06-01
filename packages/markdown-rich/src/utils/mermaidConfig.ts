/**
 * Mermaid %%{init: ...}%% ディレクティブの抽出・合成ユーティリティ
 */

const INIT_PREFIX = "%%{init:";
const INIT_SUFFIX = "}%%";

/**
 * コード先頭の %%{init: ...}%% ディレクティブを分離する。
 * ディレクティブがなければ config は空文字を返す。
 */
export function extractMermaidConfig(code: string): { config: string; body: string } {
  if (!code.startsWith(INIT_PREFIX)) return { config: "", body: code };

  const suffixIdx = code.indexOf(INIT_SUFFIX, INIT_PREFIX.length);
  if (suffixIdx < 0) return { config: "", body: code };

  const rawJson = code.slice(INIT_PREFIX.length, suffixIdx).trim();
  let body = code.slice(suffixIdx + INIT_SUFFIX.length);
  // ディレクティブ直後の空白・改行を除去
  body = body.replace(/^[ \t]*\n?/, "");
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
