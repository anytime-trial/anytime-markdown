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
function isValidMimeChar(c: number): boolean {
  return (
    (c >= 97 && c <= 122) ||
    (c >= 65 && c <= 90) ||
    (c >= 48 && c <= 57) ||
    c === 43 ||
    c === 45 ||
    c === 46
  );
}

function validateMimeType(text: string, start: number, end: number): boolean {
  if (end - start <= 0 || end - start > 30) return false;
  for (let i = start; i < end; i++) {
    if (!isValidMimeChar(text.codePointAt(i)!)) return false;
  }
  return true;
}

function scanBase64Data(text: string, start: number): number {
  let end = start;
  while (end < text.length && BASE64_CHARS.has(text[end])) end++;
  return end;
}

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
    if (!validateMimeType(text, mimeStart, markerPos)) {
      searchFrom = prefixPos + DATA_IMAGE_PREFIX.length;
      continue;
    }

    // base64 データ部分を線形スキャン
    const dataStart = markerPos + BASE64_MARKER.length;
    const dataEnd = scanBase64Data(text, dataStart);
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
  return displayText.replaceAll(TOKEN_RE, (token) => tokenMap.get(token) ?? token);
}
