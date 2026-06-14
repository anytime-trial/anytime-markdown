/**
 * 思考法ダイアグラム（anytime-graph フェンス）用のテーマ対応カラーパレット。
 *
 * 値は Anytime Markdown デザインシステム（`/Shared/anytime-markdown-docs/spec/12.design/design.md`）
 * の「2.2 ダークモード」「2.3 ライトモード（水墨画）」トークンから導出している。
 * 図種プリセットはこのパレット経由で色を解決し、ダーク/ライト両モードで読めるようにする。
 */

export interface ThinkingPalette {
  /** ノード面のベースサーフェス */
  surface: string;
  /** 一段濃い/淡いサーフェス（強調ノード用） */
  surfaceStrong: string;
  /** 既定の枠線 */
  stroke: string;
  /** 本文テキスト */
  text: string;
  /** 補足テキスト */
  textMuted: string;
  /** ブランド差し色（アンバー） */
  accent: string;
  /** 背骨・幹など構造線の色 */
  spine: string;
  /** カテゴリ識別用の色（fishbone/affinity/swot 等） */
  categories: readonly string[];
}

const DARK_PALETTE: ThinkingPalette = {
  surface: '#1A202C',
  surfaceStrong: '#232B3A',
  stroke: 'rgba(255,255,255,0.24)',
  text: 'rgba(255,255,255,0.87)',
  textMuted: 'rgba(255,255,255,0.60)',
  accent: '#E8A012',
  spine: 'rgba(255,255,255,0.55)',
  // Admonition 系（design 2.1）＋ primary/accent をカテゴリ色として転用
  categories: ['#1F6FEB', '#238636', '#8957E5', '#D29922', '#DA3633', '#90CAF9', '#E8A012'],
};

const LIGHT_PALETTE: ThinkingPalette = {
  surface: '#FBF9F3',
  surfaceStrong: '#EBE8DF',
  stroke: 'rgba(31,30,28,0.45)',
  text: '#1F1E1C',
  textMuted: '#5C5A55',
  accent: '#E8A012',
  spine: 'rgba(31,30,28,0.55)',
  // 水墨画パレット（design 2.3）の墨系＋差し色
  categories: ['#3D4A52', '#4B5A3E', '#6B2A20', '#4A5A6B', '#222A30', '#8A918F', '#E8A012'],
};

/** ダーク/ライトの思考図パレットを返す。 */
export function thinkingPalette(isDark: boolean): ThinkingPalette {
  return isDark ? DARK_PALETTE : LIGHT_PALETTE;
}

/** index 番目のカテゴリ色を循環で返す。 */
export function categoryColor(index: number, isDark: boolean): string {
  const cats = thinkingPalette(isDark).categories;
  return cats[((index % cats.length) + cats.length) % cats.length];
}

/**
 * 16進カラー（#rgb / #rrggbb）を rgba 文字列に変換する。
 * カテゴリ色をノード面の淡いティントに使うためのヘルパー。
 * 解釈できない入力（rgba() など）はそのまま返す。
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (!hex) return color;
  let h = hex[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}
