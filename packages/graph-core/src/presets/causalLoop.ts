/**
 * 因果ループ図（CLD / システム思考）プリセット。
 * 変数を円周上に配置し、極性（+ / -）つきの矢印で因果リンクを描く。
 */

import type { GraphDocument } from '../types';
import { ringPoints, type Point } from './layout';
import { thinkingPalette, withAlpha } from './palette';
import { mkNode, lineEdge, mkDoc, type NodeOpts } from './build';

export interface CausalLink {
  from: string;
  to: string;
  /** '+' = 同方向（強化）, '-' = 逆方向（抑制） */
  polarity: '+' | '-';
}

export interface CausalLoopSpec {
  type: 'causal-loop';
  title?: string;
  links: CausalLink[];
}

const NODE_W = 140;
const NODE_H = 56;

/** 中心 (cx,cy)・寸法 (w,h) の矩形上で、点 (tx,ty) 方向の境界点を返す。 */
function borderPoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number): Point {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = w / 2;
  const hh = h / 2;
  const scale = Math.min(
    dx !== 0 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY,
    dy !== 0 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function buildCausalLoop(spec: CausalLoopSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);

  // リンク端点から変数（ノード）を出現順で抽出
  const order: string[] = [];
  const seen = new Set<string>();
  for (const link of spec.links) {
    for (const v of [link.from, link.to]) {
      if (!seen.has(v)) {
        seen.add(v);
        order.push(v);
      }
    }
  }

  const radius = Math.max(180, order.length * 40);
  const pts = ringPoints(order.length, { radius, centerX: 0, centerY: 0 });
  const centerOf = new Map<string, Point>();
  const nodes = order.map((label, i) => {
    const c = pts[i];
    centerOf.set(label, c);
    return mkNode(`var-${i}`, 'rect', { x: c.x - NODE_W / 2, y: c.y - NODE_H / 2, width: NODE_W, height: NODE_H }, label, {
      fill: pal.surface,
      stroke: pal.stroke,
      strokeWidth: 2,
      fontColor: pal.text,
      fontSize: 14,
      borderRadius: 28,
      metadata: { path: `variables.${i}` },
    } satisfies NodeOpts);
  });

  const plusColor = isDark ? '#66BB6A' : '#4B5A3E';
  const minusColor = isDark ? '#9B7BD8' : '#4A5A6B';

  const edges = spec.links.map((link, i) => {
    const a = centerOf.get(link.from)!;
    const b = centerOf.get(link.to)!;
    const from = borderPoint(a.x, a.y, NODE_W, NODE_H, b.x, b.y);
    const to = borderPoint(b.x, b.y, NODE_W, NODE_H, a.x, a.y);
    return lineEdge(`link-${i}`, from, to, {
      stroke: link.polarity === '+' ? plusColor : minusColor,
      strokeWidth: 2,
      endShape: 'arrow',
      label: link.polarity,
    });
  });

  return mkDoc(spec.title ?? 'causal-loop', nodes, edges);
}
