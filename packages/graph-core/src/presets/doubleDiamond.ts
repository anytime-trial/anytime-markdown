/**
 * ダブルダイヤモンド（デザイン思考）プリセット。
 * 発散→収束を2回繰り返す4フェーズ（Discover / Define / Develop / Deliver）。
 * 2つのダイヤ輪郭を背景に、各フェーズの見出しと項目を配置する。
 */

import type { GraphDocument, GraphNode } from '../types';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, mkDoc, type NodeOpts } from './build';

export interface DoubleDiamondSpec {
  type: 'double-diamond';
  discover: string[];
  define: string[];
  develop: string[];
  deliver: string[];
}

const PHASES: Array<{ key: keyof Omit<DoubleDiamondSpec, 'type'>; label: string }> = [
  { key: 'discover', label: 'Discover（発散）' },
  { key: 'define', label: 'Define（収束）' },
  { key: 'develop', label: 'Develop（発散）' },
  { key: 'deliver', label: 'Deliver（収束）' },
];

const COL_W = 210;
const COL_GAP = 18;

export function buildDoubleDiamond(spec: DoubleDiamondSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const nodes: GraphNode[] = [];

  const colX = (i: number): number => i * (COL_W + COL_GAP);
  const headerY = 0;
  const headerH = 54;
  const itemsY = headerY + headerH + 130;

  // 背景のダイヤ輪郭（最初に積んで背面へ）
  const diamondH = 200;
  const diamondCenterY = headerY + headerH / 2;
  const d1x = colX(0) - 8;
  const d1w = COL_W * 2 + COL_GAP + 16;
  const d2x = colX(2) - 8;
  const accentA = categoryColor(0, isDark);
  const accentB = categoryColor(3, isDark);
  nodes.push(
    mkNode('diamond-1', 'diamond', { x: d1x, y: diamondCenterY - diamondH / 2, width: d1w, height: diamondH }, '', {
      fill: 'transparent',
      stroke: accentA,
      strokeWidth: 2,
    } satisfies NodeOpts),
    mkNode('diamond-2', 'diamond', { x: d2x, y: diamondCenterY - diamondH / 2, width: d1w, height: diamondH }, '', {
      fill: 'transparent',
      stroke: accentB,
      strokeWidth: 2,
    } satisfies NodeOpts),
  );

  PHASES.forEach((phase, i) => {
    const color = categoryColor(i, isDark);
    const x = colX(i);
    // フェーズ見出し
    nodes.push(
      mkNode(`phase-${i}`, 'rect', { x, y: headerY, width: COL_W, height: headerH }, phase.label, {
        fill: withAlpha(color, isDark ? 0.24 : 0.16),
        stroke: color,
        strokeWidth: 2,
        fontColor: pal.text,
        fontSize: 14,
        fontStyle: 1,
        borderRadius: 8,
      } satisfies NodeOpts),
    );
    // 項目（箇条書き）
    const items = spec[phase.key];
    const text = items.length ? items.map((s) => `・${s}`).join('\n') : '—';
    const h = Math.max(70, 24 + items.length * 22);
    nodes.push(
      mkNode(`items-${i}`, 'rect', { x, y: itemsY, width: COL_W, height: h }, text, {
        fill: pal.surface,
        stroke: pal.stroke,
        strokeWidth: 1.5,
        fontColor: pal.text,
        fontSize: 13,
        borderRadius: 6,
      } satisfies NodeOpts),
    );
  });

  return mkDoc('double-diamond', nodes, []);
}
