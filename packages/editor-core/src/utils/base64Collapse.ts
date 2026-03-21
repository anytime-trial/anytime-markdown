/**
 * ソースモード表示用: base64画像データを短いトークンに置換し、
 * 元データをtokenMapに保持する。
 *
 * トークン形式: `data:base64-image-N`（連番）
 */

const DATA_IMAGE_PREFIX = "data:image/";
const BASE64_MARKER = ";base64,";
const BASE64_CHARS = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".split(""),
);
const TOKEN_PREFIX = "data:base64-image-";
const TOKEN_RE = /data:base64-image-\d+/g;

export interface Base64TokenSpan {
  start: number;
  end: number;
}

/**
 * text 中の data:image/...;base64,... を線形スキャンで検出し、トークンに置換する。
 * 正規表現のバックトラッキングを回避するためインデックスベースで実装。
 */
export function collapseBase64(text: string): {
  displayText: string;
  tokenMap: Map<string, string>;
  tokenSpans: Base64TokenSpan[];
} {
  const tokenMap = new Map<string, string>();
  const tokenSpans: Base64TokenSpan[] = [];
  const parts: string[] = [];
  let tokenIndex = 0;
  let lastEnd = 0;
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const prefixPos = text.indexOf(DATA_IMAGE_PREFIX, searchFrom);
    if (prefixPos < 0) break;

    // ";base64," を探す
    const markerPos = text.indexOf(BASE64_MARKER, prefixPos + DATA_IMAGE_PREFIX.length);
    if (markerPos < 0) {
      searchFrom = prefixPos + DATA_IMAGE_PREFIX.length;
      continue;
    }

    // MIME タイプ部分の検証（image/ と ;base64, の間）
    const mimeStart = prefixPos + DATA_IMAGE_PREFIX.length;
    const mimeEnd = markerPos;
    let validMime = mimeEnd - mimeStart > 0 && mimeEnd - mimeStart <= 30;
    for (let i = mimeStart; validMime && i < mimeEnd; i++) {
      const c = text.charCodeAt(i);
      if (!((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46)) {
        validMime = false;
      }
    }
    if (!validMime) {
      searchFrom = prefixPos + DATA_IMAGE_PREFIX.length;
      continue;
    }

    // base64 データ部分を線形スキャン
    const dataStart = markerPos + BASE64_MARKER.length;
    let dataEnd = dataStart;
    while (dataEnd < text.length && BASE64_CHARS.has(text[dataEnd])) {
      dataEnd++;
    }
    if (dataEnd === dataStart) {
      searchFrom = dataEnd;
      continue;
    }

    // トークンに置換
    const match = text.slice(prefixPos, dataEnd);
    const token = `${TOKEN_PREFIX}${tokenIndex++}`;
    tokenMap.set(token, match);

    const preceding = text.slice(lastEnd, prefixPos);
    parts.push(preceding);
    const spanStart = parts.join("").length;
    parts.push(token);
    tokenSpans.push({ start: spanStart, end: spanStart + token.length });

    lastEnd = dataEnd;
    searchFrom = dataEnd;
  }

  parts.push(text.slice(lastEnd));
  return { displayText: parts.join(""), tokenMap, tokenSpans };
}

export function restoreBase64(
  displayText: string,
  tokenMap: Map<string, string>,
): string {
  return displayText.replace(TOKEN_RE, (token) => tokenMap.get(token) ?? token);
}
