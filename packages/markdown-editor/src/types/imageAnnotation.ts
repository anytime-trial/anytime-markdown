export interface ImageAnnotation {
  id: string;
  type: "rect" | "circle" | "line";
  x1: number;  // 開始 X（画像に対する %）
  y1: number;  // 開始 Y（画像に対する %）
  x2: number;  // 終了 X（画像に対する %）
  y2: number;  // 終了 Y（画像に対する %）
  color: string;
  comment?: string;
  resolved?: boolean;
}

export type AnnotationTool = "rect" | "circle" | "line" | "eraser";

export const ANNOTATION_COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#22c55e" },
  { label: "Yellow", value: "#eab308" },
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#000000" },
] as const;

export function generateAnnotationId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36)).join("").slice(0, 6);
}

function isImageAnnotation(value: unknown): value is ImageAnnotation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const hasValidType =
    candidate.type === "rect" || candidate.type === "circle" || candidate.type === "line";
  return (
    typeof candidate.id === "string" &&
    hasValidType &&
    typeof candidate.x1 === "number" &&
    typeof candidate.y1 === "number" &&
    typeof candidate.x2 === "number" &&
    typeof candidate.y2 === "number" &&
    typeof candidate.color === "string"
  );
}

export function parseAnnotations(json: string | null): ImageAnnotation[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isImageAnnotation);
  } catch (error) {
    console.warn("[imageAnnotation] parseAnnotations: failed to parse annotation JSON", error);
    return [];
  }
}

export function serializeAnnotations(annotations: ImageAnnotation[]): string | null {
  if (annotations.length === 0) return null;
  return JSON.stringify(annotations);
}

// --- Markdown への保存形式（`<!-- image-comments -->` ブロック） ---
// エディタの保存・読込と mcp-markdown の読み取りツールが同じ形式を共有する。
// Why not: 各所でキーを組み立てない。式がずれると注記が別の画像へ付くか、黙って消える。

export const IMAGE_COMMENTS_BLOCK_START = "\n<!-- image-comments\n";
export const IMAGE_COMMENTS_BLOCK_END = "\n-->";

/** src がこの長さを超えると（主に data URI）、キーには先頭だけを使う */
const LONG_SRC_THRESHOLD = 100;
const LONG_SRC_KEY_LENGTH = 20;

/** 文書内 index 番目の画像（0 始まり）の注記キー */
export function buildAnnotationKey(index: number, src: string): string {
  const srcKey = src.length > LONG_SRC_THRESHOLD ? src.slice(0, LONG_SRC_KEY_LENGTH) : src;
  return `img${index}:${srcKey}`;
}

/** 注記キーを通し番号と src（長い src は先頭のみ）へ分解する。形式外は null */
export function parseAnnotationKey(key: string): { index: number; srcKey: string } | null {
  const match = /^img(\d+):/.exec(key);
  if (!match) return null;
  return { index: Number(match[1]), srcKey: key.slice(match[0].length) };
}

/** src が注記キーの srcKey と一致するか（長い src は先頭一致） */
export function matchesAnnotationSrcKey(src: string, srcKey: string): boolean {
  return buildAnnotationKey(0, src) === `img0:${srcKey}`;
}

/**
 * Markdown 末尾の `<!-- image-comments -->` ブロックを抽出する。
 * lines は出現順の行、malformed は `=` を含まず読めなかった行。
 */
export function extractImageAnnotationBlock(md: string): {
  imageAnnotations: Map<string, string>;
  lines: { key: string; data: string }[];
  malformed: string[];
  body: string;
} {
  const imageAnnotations = new Map<string, string>();
  const lines: { key: string; data: string }[] = [];
  const malformed: string[] = [];
  const idx = md.indexOf(IMAGE_COMMENTS_BLOCK_START);
  if (idx === -1) return { imageAnnotations, lines, malformed, body: md };

  const dataStart = idx + IMAGE_COMMENTS_BLOCK_START.length;
  const dataEnd = md.indexOf(IMAGE_COMMENTS_BLOCK_END, dataStart);
  if (dataEnd === -1) return { imageAnnotations, lines, malformed, body: md };

  for (const line of md.slice(dataStart, dataEnd).split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      if (line.trim() !== "") malformed.push(line);
      continue;
    }
    const key = line.slice(0, eqIdx);
    const data = line.slice(eqIdx + 1);
    imageAnnotations.set(key, data);
    lines.push({ key, data });
  }

  const body = md.slice(0, idx) + md.slice(dataEnd + IMAGE_COMMENTS_BLOCK_END.length);
  return { imageAnnotations, lines, malformed, body };
}
