/**
 * ソースモード表示用: base64画像データを短いトークンに置換し、
 * 元データをtokenMapに保持する。
 *
 * トークン形式: `data:base64-image-N`（連番）
 */

const BASE64_DATA_URL_RE = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
const TOKEN_PREFIX = "data:base64-image-";
const TOKEN_RE = /data:base64-image-\d+/g;

export interface Base64TokenSpan {
  start: number;
  end: number;
}

export function collapseBase64(text: string): {
  displayText: string;
  tokenMap: Map<string, string>;
  tokenSpans: Base64TokenSpan[];
} {
  const tokenMap = new Map<string, string>();
  const tokenSpans: Base64TokenSpan[] = [];
  let index = 0;
  let offset = 0;

  const displayText = text.replace(BASE64_DATA_URL_RE, (match, matchPos: number) => {
    const token = `${TOKEN_PREFIX}${index++}`;
    tokenMap.set(token, match);
    const adjustedPos = matchPos - offset;
    tokenSpans.push({ start: adjustedPos, end: adjustedPos + token.length });
    offset += match.length - token.length;
    return token;
  });

  return { displayText, tokenMap, tokenSpans };
}

export function restoreBase64(
  displayText: string,
  tokenMap: Map<string, string>,
): string {
  return displayText.replace(TOKEN_RE, (token) => tokenMap.get(token) ?? token);
}
