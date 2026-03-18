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

export function parseAnnotations(json: string | null): ImageAnnotation[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

export function serializeAnnotations(annotations: ImageAnnotation[]): string | null {
  if (annotations.length === 0) return null;
  return JSON.stringify(annotations);
}
