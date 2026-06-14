/**
 * マインドマップ（放射状）プリセット。ラテラル思考 / IF 思考向け。
 * 中心トピックから第1階層ブランチを円状に配し、子はブランチ方向へ外側に伸ばす。
 */

import type { GraphDocument, GraphNode, GraphEdge } from '../types';
import { radialBranches, type Point } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, lineEdge, mkDoc, type NodeOpts } from './build';
import type { TreeNodeSpec } from './trees';

export interface MindmapSpec {
  type: 'mindmap';
  root: string;
  branches: TreeNodeSpec[];
}

const RADIUS_STEP = 200;
const NODE_W = 150;
const NODE_H = 50;

export function buildMindmap(spec: MindmapSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let counter = 0;
  const nextId = (): string => `m${counter++}`;

  // 中心トピック
  const centerId = nextId();
  nodes.push(
    mkNode(centerId, 'ellipse', { x: -90, y: -36, width: 180, height: 72 }, spec.root, {
      fill: withAlpha(pal.accent, isDark ? 0.24 : 0.18),
      stroke: pal.accent,
      strokeWidth: 2.5,
      fontColor: pal.text,
      fontSize: 16,
      fontStyle: 1,
      metadata: { path: 'root' },
    } satisfies NodeOpts),
  );

  const branchGeo = radialBranches(spec.branches.length, { radius: RADIUS_STEP });

  // ブランチ配下の子を outward 方向へ再帰配置（兄弟は outward に垂直方向へ広げる）
  const placeSubtree = (
    node: TreeNodeSpec,
    parentId: string,
    center: Point,
    outward: Point,
    depth: number,
    branchColor: string,
    parentPath: string,
  ): void => {
    const children = node.children ?? [];
    if (children.length === 0) return;
    const perp = { x: -outward.y, y: outward.x };
    const spread = 86;
    children.forEach((child, idx) => {
      const offset = (idx - (children.length - 1) / 2) * spread;
      const cx = center.x + outward.x * RADIUS_STEP + perp.x * offset;
      const cy = center.y + outward.y * RADIUS_STEP + perp.y * offset;
      const id = nextId();
      const childPath = `${parentPath}.children.${idx}`;
      nodes.push(
        mkNode(id, 'rect', { x: cx - NODE_W / 2, y: cy - NODE_H / 2, width: NODE_W, height: NODE_H }, child.label, {
          fill: withAlpha(branchColor, isDark ? 0.14 : 0.1),
          stroke: branchColor,
          strokeWidth: 1.5,
          fontColor: pal.text,
          fontSize: 13,
          borderRadius: 6,
          metadata: { path: childPath },
        } satisfies NodeOpts),
      );
      edges.push(
        lineEdge(`${parentId}->${id}`, center, { x: cx, y: cy }, { stroke: branchColor, strokeWidth: 1.5 }),
      );
      placeSubtree(child, id, { x: cx, y: cy }, outward, depth + 1, branchColor, childPath);
    });
  };

  spec.branches.forEach((branch, i) => {
    const geo = branchGeo[i];
    const color = categoryColor(i, isDark);
    const id = nextId();
    nodes.push(
      mkNode(id, 'rect', { x: geo.base.x - NODE_W / 2, y: geo.base.y - NODE_H / 2, width: NODE_W, height: NODE_H }, branch.label, {
        fill: withAlpha(color, isDark ? 0.2 : 0.14),
        stroke: color,
        strokeWidth: 2,
        fontColor: pal.text,
        fontSize: 14,
        fontStyle: 1,
        borderRadius: 8,
        metadata: { path: `branches.${i}` },
      } satisfies NodeOpts),
    );
    edges.push(lineEdge(`${centerId}->${id}`, { x: 0, y: 0 }, geo.base, { stroke: color, strokeWidth: 2 }));
    placeSubtree(branch, id, geo.base, geo.outward, 1, color, `branches.${i}`);
  });

  return mkDoc(spec.root || 'mindmap', nodes, edges);
}
