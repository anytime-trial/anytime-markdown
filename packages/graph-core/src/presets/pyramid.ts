/**
 * 抽象度ピラミッド（メタ思考 / 抽象化）プリセット。
 * 上段ほど抽象、下段ほど具体。段ごとに幅が広がるステップピラミッド。
 */

import type { GraphDocument } from '../types';
import { pyramidTiers } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, mkDoc, type NodeOpts } from './build';

export interface PyramidTier {
  label: string;
  desc?: string;
}

export interface PyramidSpec {
  type: 'pyramid';
  title?: string;
  /** 上（抽象）→ 下（具体）の順 */
  tiers: PyramidTier[];
}

export function buildPyramid(spec: PyramidSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const rects = pyramidTiers(spec.tiers.length, {
    topWidth: 200,
    bottomWidth: 560,
    tierHeight: 78,
    gap: 14,
    centerX: 0,
    originY: 0,
  });

  const nodes = spec.tiers.map((tier, i) => {
    const color = categoryColor(i, isDark);
    const text = tier.desc ? `${tier.label}\n(${tier.desc})` : tier.label;
    return mkNode(`tier-${i}`, 'rect', rects[i], text, {
      fill: withAlpha(color, isDark ? 0.2 : 0.14),
      stroke: color,
      strokeWidth: 2,
      fontColor: pal.text,
      fontSize: 15,
      borderRadius: 4,
      metadata: { path: `tiers.${i}` },
    } satisfies NodeOpts);
  });

  return mkDoc(spec.title ?? 'pyramid', nodes, []);
}
