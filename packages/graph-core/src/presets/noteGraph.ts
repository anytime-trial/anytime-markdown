/**
 * ノート網（ドキュメント関係グラフ）プリセット。
 *
 * Markdown フロントマター由来の最小情報（パス・タイトル・関連）から、
 * 決定的に `GraphDocument` を組み立てる純粋関数。DB には一切依存しない。
 *
 * - ノード   = ドキュメント（id = リポジトリルート相対 POSIX パス）
 * - 主エッジ = `related`（解決できれば実エッジ、できなければプレースホルダ）
 * - 派生エッジ = `tags` / `category` / `c4Scope` の共有（既定オフ・レイヤー切替）
 *
 * 座標は円状（ringPoints）の初期配置のみを与える。実際の力学的整列は
 * ビューア側（GraphView / PhysicsEngine）がインタラクティブに行う。
 */

import type { GraphDocument, GraphNode, GraphEdge, GraphGroup } from '../types';
import { ringPoints } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, connectorEdge, mkDoc, type NodeOpts } from './build';

/** ノート網ノードの最小入力（フロントマター由来・呼び出し側で抽出する）。 */
export interface NoteGraphDocInput {
  /** リポジトリルート相対 POSIX パス。ノード ID 兼参照キー。 */
  path: string;
  /** 表示ラベル（frontmatter `title`）。 */
  title: string;
  /** ドキュメント種別（frontmatter `type`）。色分けに使う。 */
  type?: string;
  /** グループ（frontmatter `category`）。 */
  category?: string;
  /** 明示リンク（frontmatter `related`・ルート相対パス）。 */
  related?: readonly string[];
  /** 共有クラスタ用タグ（frontmatter `tags`）。 */
  tags?: readonly string[];
  /** C4 アンカー（frontmatter `c4Scope`）。 */
  c4Scope?: readonly string[];
}

/** 派生エッジ（クラスタ）の有効/無効。 */
export interface NoteGraphEdgeLayers {
  /** 明示 `related` エッジ（既定 true）。 */
  related?: boolean;
  /** `tags` 共有クラスタ（既定 false）。 */
  tags?: boolean;
  /** `category` 共有クラスタ（既定 false）。 */
  category?: boolean;
  /** `c4Scope` 共有アンカー（既定 false）。 */
  c4Scope?: boolean;
}

export interface NoteGraphOptions {
  isDark?: boolean;
  edges?: NoteGraphEdgeLayers;
}

const NODE_W = 168;
const NODE_H = 52;
const PLACEHOLDER_W = 160;
const PLACEHOLDER_H = 44;
const RING_RADIUS_BASE = 240;
const RING_RADIUS_PER_NODE = 26;

/** 種別ごとに安定した色 index を割り当てる（出現順）。 */
function buildTypeColorMap(docs: readonly NoteGraphDocInput[], isDark: boolean): Map<string, string> {
  const order: string[] = [];
  for (const d of docs) {
    const t = d.type ?? '';
    if (t && !order.includes(t)) order.push(t);
  }
  const map = new Map<string, string>();
  order.forEach((t, i) => map.set(t, categoryColor(i, isDark)));
  return map;
}

/** 無向ペアを正規化したキー（重複排除用）。 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/**
 * 共有属性（tags / c4Scope / category）から無向クラスタエッジを生成する。
 * 同じ値を持つドキュメントどうしを結ぶ。
 */
function buildClusterEdges(
  docs: readonly NoteGraphDocInput[],
  pick: (d: NoteGraphDocInput) => readonly string[] | undefined,
  idPrefix: string,
  stroke: string,
  seen: Set<string>,
): GraphEdge[] {
  const byValue = new Map<string, string[]>();
  for (const d of docs) {
    for (const v of pick(d) ?? []) {
      const list = byValue.get(v) ?? [];
      list.push(d.path);
      byValue.set(v, list);
    }
  }
  const edges: GraphEdge[] = [];
  for (const paths of byValue.values()) {
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const key = `${idPrefix}:${pairKey(paths[i], paths[j])}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push(
          connectorEdge(key, paths[i], paths[j], { stroke, strokeWidth: 1.5, dashed: true, endShape: 'none' }),
        );
      }
    }
  }
  return edges;
}

/**
 * ノート網グラフを構築する。
 *
 * @param docs グラフに含めるドキュメント（呼び出し側で `graph: false` 等を除外済み）。
 * @param opts 配色テーマと派生エッジレイヤーの有効化。
 */
export function buildNoteGraph(
  docs: readonly NoteGraphDocInput[],
  opts: NoteGraphOptions = {},
): GraphDocument {
  const isDark = opts.isDark ?? true;
  const layers = opts.edges ?? {};
  const relatedEnabled = layers.related ?? true;

  const pal = thinkingPalette(isDark);
  const typeColor = buildTypeColorMap(docs, isDark);

  const known = new Set(docs.map((d) => d.path));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // ── ドキュメントノード（円状初期配置） ───────────────────────────
  const ring = ringPoints(docs.length, {
    radius: RING_RADIUS_BASE + docs.length * RING_RADIUS_PER_NODE,
  });
  docs.forEach((d, i) => {
    const color = typeColor.get(d.type ?? '') ?? pal.accent;
    const pt = ring[i] ?? { x: 0, y: 0 };
    const style: NodeOpts = {
      fill: withAlpha(color, isDark ? 0.22 : 0.16),
      stroke: color,
      strokeWidth: 2,
      fontColor: pal.text,
      fontSize: 13,
      borderRadius: 8,
    };
    const node = mkNode(
      d.path,
      'rect',
      { x: pt.x - NODE_W / 2, y: pt.y - NODE_H / 2, width: NODE_W, height: NODE_H },
      d.title,
      style,
    );
    node.url = d.path;
    node.metadata = { path: d.path, ...(d.type ? { docType: d.type } : {}) };
    nodes.push(node);
  });

  // ── 主エッジ: related（解決 or プレースホルダ） ──────────────────
  const placeholders = new Map<string, GraphNode>();
  const relatedSeen = new Set<string>();
  if (relatedEnabled) {
    let phIndex = 0;
    for (const d of docs) {
      for (const target of d.related ?? []) {
        // 自己参照と重複エッジ（ID 衝突）を除外する
        if (target === d.path) continue;
        const edgeKey = `${d.path}->${target}`;
        if (relatedSeen.has(edgeKey)) continue;
        relatedSeen.add(edgeKey);
        if (!known.has(target) && !placeholders.has(target)) {
          // 未解決参照はプレースホルダノード（グレー・破線）として可視化
          const angle = -Math.PI / 2 + phIndex * 0.7;
          phIndex += 1;
          const px = (RING_RADIUS_BASE + 120) * Math.cos(angle);
          const py = (RING_RADIUS_BASE + 120) * Math.sin(angle);
          const ph = mkNode(
            target,
            'rect',
            { x: px - PLACEHOLDER_W / 2, y: py - PLACEHOLDER_H / 2, width: PLACEHOLDER_W, height: PLACEHOLDER_H },
            target.split('/').at(-1) ?? target,
            {
              fill: 'transparent',
              stroke: withAlpha(pal.text, 0.4),
              strokeWidth: 1.5,
              fontColor: withAlpha(pal.text, 0.7),
              fontSize: 12,
              dashed: true,
              borderRadius: 8,
            },
          );
          ph.url = target;
          ph.metadata = { path: target, placeholder: 1 };
          placeholders.set(target, ph);
        }
        edges.push(
          connectorEdge(`related:${d.path}->${target}`, d.path, target, {
            stroke: withAlpha(pal.accent, 0.8),
            strokeWidth: 2,
            endShape: 'arrow',
          }),
        );
      }
    }
  }
  nodes.push(...placeholders.values());

  // ── 派生エッジ（既定オフ・レイヤー切替） ────────────────────────
  const seen = new Set<string>();
  if (layers.tags) {
    edges.push(...buildClusterEdges(docs, (d) => d.tags, 'tag', withAlpha(pal.text, 0.3), seen));
  }
  if (layers.category) {
    edges.push(
      ...buildClusterEdges(docs, (d) => (d.category ? [d.category] : undefined), 'cat', withAlpha(pal.text, 0.25), seen),
    );
  }
  if (layers.c4Scope) {
    edges.push(...buildClusterEdges(docs, (d) => d.c4Scope, 'c4', withAlpha(pal.accent, 0.4), seen));
  }

  // ── グループ: category ごと ─────────────────────────────────────
  const byCategory = new Map<string, string[]>();
  for (const d of docs) {
    if (!d.category) continue;
    const list = byCategory.get(d.category) ?? [];
    list.push(d.path);
    byCategory.set(d.category, list);
  }
  const groups: GraphGroup[] = [];
  for (const [category, memberIds] of byCategory) {
    groups.push({ id: `group:${category}`, memberIds, label: category });
  }

  const doc = mkDoc('note-graph', nodes, edges);
  doc.id = 'note-graph';
  doc.groups = groups;
  return doc;
}
