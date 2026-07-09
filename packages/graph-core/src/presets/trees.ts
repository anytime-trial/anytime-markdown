/**
 * ツリー系プリセット。
 * - logic-tree: ロジックツリー / イシューツリー（左→右の階層）
 * - why-chain: なぜなぜ分析・帰結チェーン（縦方向の連鎖）
 */

import type { GraphDocument, GraphNode, GraphEdge } from '../types';
import { tidyTreeLayout, chainPositions, type TreeInput } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, connectorEdge, mkDoc, type NodeOpts } from './build';

export interface TreeNodeSpec {
  label: string;
  children?: TreeNodeSpec[];
}

export interface LogicTreeSpec {
  type: 'logic-tree';
  root: string;
  children: TreeNodeSpec[];
}

export interface WhyChainSpec {
  type: 'why-chain';
  problem: string;
  steps: string[];
}

interface FlatNode {
  id: string;
  label: string;
  depth: number;
  /** spec 内位置（root スカラは 'root'、子は 'children.0.children.1' 形式）。 */
  path: string;
}

/** TreeNodeSpec ツリーに決定的 id を振り、レイアウト用 TreeInput・ノード・エッジへ展開する。 */
function flatten(rootLabel: string, children: TreeNodeSpec[]): {
  input: TreeInput;
  flat: FlatNode[];
  edges: Array<[string, string]>;
} {
  const flat: FlatNode[] = [];
  const edges: Array<[string, string]> = [];
  let counter = 0;
  const nextId = (): string => `n${counter++}`;

  const walk = (label: string, kids: TreeNodeSpec[] | undefined, depth: number, path: string): TreeInput => {
    const id = nextId();
    flat.push({ id, label, depth, path });
    // root（depth 0）の子は spec.children 直下なので 'children.*'、それ以降は 'path.children.*'。
    const childBase = depth === 0 ? 'children' : `${path}.children`;
    const childInputs = (kids ?? []).map((c, idx) => {
      const childInput = walk(c.label, c.children, depth + 1, `${childBase}.${idx}`);
      edges.push([id, childInput.id]);
      return childInput;
    });
    return { id, children: childInputs };
  };

  const input = walk(rootLabel, children, 0, 'root');
  return { input, flat, edges };
}

export function buildLogicTree(spec: LogicTreeSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const { input, flat, edges: treeEdges } = flatten(spec.root, spec.children);
  const layout = tidyTreeLayout(input, {
    nodeWidth: 200,
    nodeHeight: 58,
    levelGap: 80,
    siblingGap: 22,
    direction: 'LR',
  });

  const nodes: GraphNode[] = flat.map((fn) => {
    const rect = layout.get(fn.id)!;
    const isRoot = fn.depth === 0;
    const color = isRoot ? pal.accent : categoryColor(fn.depth - 1, isDark);
    return mkNode(fn.id, 'rect', rect, fn.label, {
      fill: withAlpha(color, isDark ? 0.18 : 0.12),
      stroke: color,
      strokeWidth: isRoot ? 2.5 : 2,
      fontColor: pal.text,
      fontSize: isRoot ? 15 : 14,
      fontStyle: isRoot ? 1 : 0,
      borderRadius: 6,
      metadata: { path: fn.path },
    } satisfies NodeOpts);
  });

  const edges: GraphEdge[] = treeEdges.map(([from, to], i) =>
    connectorEdge(`e${i}`, from, to, { stroke: pal.stroke, strokeWidth: 1.5, endShape: 'none' }),
  );

  return mkDoc(spec.root || 'logic-tree', nodes, edges);
}

export function buildWhyChain(spec: WhyChainSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const items = [spec.problem, ...spec.steps];
  const rects = chainPositions(items.length, {
    nodeWidth: 320,
    nodeHeight: 66,
    gap: 46,
    direction: 'vertical',
  });

  const nodes: GraphNode[] = items.map((label, i) => {
    const isProblem = i === 0;
    const color = isProblem ? pal.accent : categoryColor(0, isDark);
    return mkNode(`step-${i}`, 'rect', rects[i], label, {
      fill: withAlpha(color, isDark ? 0.18 : 0.12),
      stroke: color,
      strokeWidth: isProblem ? 2.5 : 2,
      fontColor: pal.text,
      fontSize: isProblem ? 15 : 14,
      fontStyle: isProblem ? 1 : 0,
      borderRadius: 8,
      metadata: { path: isProblem ? 'problem' : `steps.${i - 1}` },
    } satisfies NodeOpts);
  });

  const edges: GraphEdge[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    edges.push(
      connectorEdge(`why-${i}`, `step-${i}`, `step-${i + 1}`, {
        stroke: pal.spine,
        strokeWidth: 2,
        endShape: 'arrow',
        label: i === 0 ? 'なぜ?' : undefined,
      }),
    );
  }

  return mkDoc(spec.problem || 'why-chain', nodes, edges);
}
