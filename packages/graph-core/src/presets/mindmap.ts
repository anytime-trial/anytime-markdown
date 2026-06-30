/**
 * マインドマップ（FreeMind 風）プリセット。ラテラル思考 / IF 思考向け。
 * 中央トピックからブランチを葉数バランスで左右に振り分け、各サイドを
 * 水平 tidy ツリーとして外側へ展開する。子は縦に積み、親は子の縦範囲の
 * 中央に置く。ブランチ↔ノードは色付きの bezier カーブで結ぶ。
 */

import type { GraphDocument, GraphNode, GraphEdge } from '../types';
import { tidyTreeLayout, partitionBalanced, type TreeInput } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, connectorEdge, mkDoc, type NodeOpts } from './build';
import type { TreeNodeSpec } from './trees';

export interface MindmapSpec {
  type: 'mindmap';
  root: string;
  branches: TreeNodeSpec[];
}

const NODE_W = 150;
const NODE_H = 50;
const ROOT_W = 180;
const ROOT_H = 72;
const LEVEL_GAP = 80;
const SIBLING_GAP = 22;
/** ルート楕円外周から第1階層ブランチ左端までの水平ギャップ */
const ROOT_BRANCH_GAP = 46;

/** サブツリーの葉ノード数（子なしは 1）。左右バランス配分の重みに使う。 */
function leafCount(node: TreeNodeSpec): number {
  const children = node.children ?? [];
  if (children.length === 0) return 1;
  return children.reduce((sum, c) => sum + leafCount(c), 0);
}

interface BranchEntry {
  spec: TreeNodeSpec;
  /** spec 内位置パス（インライン編集・WYSIWYG mutate 用に厳密維持） */
  path: string;
  color: string;
  parentId: string;
  /** 第1階層ブランチか（root 直下） */
  isBranch: boolean;
}

export function buildMindmap(spec: MindmapSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 中央トピック（原点中心）
  const centerId = 'm0';
  nodes.push(
    mkNode(centerId, 'ellipse', { x: -ROOT_W / 2, y: -ROOT_H / 2, width: ROOT_W, height: ROOT_H }, spec.root, {
      fill: withAlpha(pal.accent, isDark ? 0.24 : 0.18),
      stroke: pal.accent,
      strokeWidth: 2.5,
      fontColor: pal.text,
      fontSize: 16,
      fontStyle: 1,
      metadata: { path: 'root' },
    } satisfies NodeOpts),
  );

  if (spec.branches.length === 0) {
    return mkDoc(spec.root || 'mindmap', nodes, edges);
  }

  // 合成ツリーの id ↔ スペック/パス/色 を保持
  const registry = new Map<string, BranchEntry>();
  let counter = 1;
  const nextId = (): string => `m${counter++}`;

  const buildTreeInput = (
    node: TreeNodeSpec,
    path: string,
    color: string,
    parentId: string,
    isBranch: boolean,
  ): TreeInput => {
    const id = nextId();
    registry.set(id, { spec: node, path, color, parentId, isBranch });
    const children = (node.children ?? []).map((child, idx) =>
      buildTreeInput(child, `${path}.children.${idx}`, color, id, false),
    );
    return { id, children };
  };

  // 葉数バランスで左右に振り分け、サイドごとに合成ルート木を作る
  const sides = partitionBalanced(spec.branches.map(leafCount)); // true=右
  const rightRoots: TreeInput[] = [];
  const leftRoots: TreeInput[] = [];
  spec.branches.forEach((branch, i) => {
    const ti = buildTreeInput(branch, `branches.${i}`, categoryColor(i, isDark), centerId, true);
    (sides[i] ? rightRoots : leftRoots).push(ti);
  });

  const SYNTH_ROOT = '__root__';
  // LR 配置でブランチ(depth1)左端を ROOT_BRANCH_GAP に合わせる水平シフト量
  const firstBranchLeft = ROOT_W / 2 + ROOT_BRANCH_GAP;
  const dxRight = firstBranchLeft - (NODE_W + LEVEL_GAP);

  const placeSide = (roots: TreeInput[], mirror: boolean): void => {
    if (roots.length === 0) return;
    const synth: TreeInput = { id: SYNTH_ROOT, children: roots };
    const layout = tidyTreeLayout(synth, {
      nodeWidth: NODE_W,
      nodeHeight: NODE_H,
      levelGap: LEVEL_GAP,
      siblingGap: SIBLING_GAP,
      direction: 'LR',
    });
    // 合成ルート中心 y を 0（実ルート中心）へ揃える
    const rootRect = layout.get(SYNTH_ROOT)!;
    const dy = -(rootRect.y + NODE_H / 2);
    const dx = mirror ? -dxRight : dxRight;
    const branchFillAlpha = isDark ? 0.2 : 0.14;
    const leafFillAlpha = isDark ? 0.14 : 0.1;

    for (const [id, rect] of layout) {
      if (id === SYNTH_ROOT) continue;
      const entry = registry.get(id)!;
      const x = (mirror ? -(rect.x + rect.width) : rect.x) + dx;
      const y = rect.y + dy;
      nodes.push(
        mkNode(id, 'rect', { x, y, width: rect.width, height: rect.height }, entry.spec.label, {
          fill: withAlpha(entry.color, entry.isBranch ? branchFillAlpha : leafFillAlpha),
          stroke: entry.color,
          strokeWidth: entry.isBranch ? 2 : 1.5,
          fontColor: pal.text,
          fontSize: entry.isBranch ? 14 : 13,
          fontStyle: entry.isBranch ? 1 : 0,
          borderRadius: entry.isBranch ? 8 : 6,
          metadata: { path: entry.path },
        } satisfies NodeOpts),
      );
      edges.push(
        connectorEdge(`${entry.parentId}->${id}`, entry.parentId, id, {
          routing: 'bezier',
          stroke: entry.color,
          strokeWidth: entry.isBranch ? 2 : 1.5,
          endShape: 'none',
        }),
      );
    }
  };

  placeSide(rightRoots, false);
  placeSide(leftRoots, true);

  return mkDoc(spec.root || 'mindmap', nodes, edges);
}
