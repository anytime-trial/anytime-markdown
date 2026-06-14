/**
 * 特性要因図（フィッシュボーン / 石川ダイアグラム）プリセット。
 * 問題（頭）から左へ背骨を引き、要因カテゴリを上下交互の骨として配置する。
 */

import type { GraphDocument } from '../types';
import { fishboneGeometry } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, lineEdge, mkDoc, type NodeOpts } from './build';

export interface FishboneCategory {
  label: string;
  causes: string[];
}

export interface FishboneSpec {
  type: 'fishbone';
  problem: string;
  categories: FishboneCategory[];
}

export function buildFishbone(spec: FishboneSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const geo = fishboneGeometry(spec.categories.length, {
    spineLength: 680,
    branchRise: 160,
    branchRun: 70,
    centerY: 0,
    originX: 0,
  });

  const nodes = [];
  const edges = [];

  // 背骨（頭に向かって矢印）
  edges.push(
    lineEdge('spine', geo.spine.from, geo.spine.to, {
      stroke: pal.spine,
      strokeWidth: 3,
      endShape: 'arrow',
    }),
  );

  // 頭（問題）
  const headW = 200;
  const headH = 90;
  nodes.push(
    mkNode('head', 'rect', { x: geo.head.x, y: geo.head.y - headH / 2, width: headW, height: headH }, spec.problem, {
      fill: withAlpha(pal.accent, isDark ? 0.22 : 0.18),
      stroke: pal.accent,
      strokeWidth: 2.5,
      fontColor: pal.text,
      fontSize: 16,
      fontStyle: 1,
      borderRadius: 8,
    } satisfies NodeOpts),
  );

  spec.categories.forEach((cat, i) => {
    const bone = geo.bones[i];
    const color = categoryColor(i, isDark);
    // 骨（背骨からカテゴリへ）
    edges.push(
      lineEdge(`bone-${i}`, bone.attach, bone.label, {
        stroke: color,
        strokeWidth: 2,
      }),
    );
    // カテゴリ要因ノード（ラベル＋要因を箇条書き）
    const text = cat.causes.length
      ? `${cat.label}\n${cat.causes.map((c) => `・${c}`).join('\n')}`
      : cat.label;
    const w = 168;
    const h = Math.max(56, 30 + cat.causes.length * 22);
    const cy = bone.above ? bone.label.y - h / 2 : bone.label.y + h / 2;
    nodes.push(
      mkNode(`cat-${i}`, 'rect', { x: bone.label.x - w / 2, y: cy - h / 2, width: w, height: h }, text, {
        fill: withAlpha(color, isDark ? 0.16 : 0.12),
        stroke: color,
        strokeWidth: 2,
        fontColor: pal.text,
        fontSize: 13,
        borderRadius: 6,
      } satisfies NodeOpts),
    );
  });

  return mkDoc(spec.problem || 'fishbone', nodes, edges);
}
