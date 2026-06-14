/**
 * anytime-graph フェンスの DSL から、埋め込み用のインライン SVG を生成する。
 * markdown のコードブロックプレビュー（markdown-rich）・SSR / PDF 経路の双方が
 * この単一エントリを呼ぶことで、描画結果を揃える。
 */

import { parseGraphDsl } from './parseGraphDsl';
import { buildThinkingDiagram } from '../presets/index';
import { thinkingPalette } from '../presets/palette';
import { exportToSvg } from './exportSvg';

/**
 * DSL テキストをテーマ対応のインライン SVG に変換する。
 * 背景は透過（ドキュメント面が透ける）、テキスト色はテーマトークンを使う。
 * 不正な DSL は `GraphDslError` を投げる（呼び出し側で握ってエラー表示する）。
 */
export function renderThinkingDiagramSvg(dsl: string, isDark: boolean): string {
  const spec = parseGraphDsl(dsl);
  const doc = buildThinkingDiagram(spec, isDark);
  const pal = thinkingPalette(isDark);
  return exportToSvg(doc, { background: 'transparent', textColor: pal.text });
}
