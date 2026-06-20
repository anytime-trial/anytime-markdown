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
import {
  type RelationType,
  type RelatedRef,
  coerceRelationType,
  relationEdgeStyle,
} from './relationStyle';

/**
 * frontmatter `related` の生エントリ。素の文字列（型なし=references 互換）または
 * `{ to, type }` オブジェクト（型付き）。`type` は実行時に正規化される。
 */
export type NoteRelatedEntry = string | { to: string; type?: string };

/** 生エントリを正規化済み {@link RelatedRef} へ変換する（未知型は references フォールバック）。 */
function normalizeRelated(entry: NoteRelatedEntry): RelatedRef {
  if (typeof entry === 'string') return { to: entry, type: 'references' };
  return { to: entry.to, type: coerceRelationType(entry.type) };
}

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
  /**
   * 明示リンク（frontmatter `related`）。素の文字列（型なし=references）または
   * `{ to, type }` 型付きオブジェクトの配列。
   */
  related?: readonly NoteRelatedEntry[];
  /** 本文の標準 markdown `.md` リンク（root 相対へ解決済み）。 */
  bodyLinks?: readonly string[];
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
      for (const ref of d.related ?? []) {
        const { to: target, type } = normalizeRelated(ref);
        // 自己参照と重複エッジ（同一 from→to→type）を除外する
        if (target === d.path) continue;
        const edgeKey = `${d.path}->${target}->${type}`;
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
        const rs = relationEdgeStyle(type, pal);
        edges.push(
          connectorEdge(`related:${type}:${d.path}->${target}`, d.path, target, {
            stroke: rs.stroke,
            strokeWidth: rs.strokeWidth,
            dashed: rs.dashed,
            endShape: rs.endShape,
            label: rs.label,
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

export interface NoteNeighborhoodOptions {
  isDark?: boolean;
  /** 中心からのホップ数（既定 1）。 */
  hops?: number;
  /** 本文リンクを関係に含める（既定 true）。false なら related のみ。 */
  includeBodyLinks?: boolean;
}

type EdgeKind = 'related' | 'body';

const NEIGHBOR_RING_STEP = 280;

/** 中心ドキュメント用ノード（強調）/ 実ノード / プレースホルダを作る。 */
function makeNeighborNode(
  path: string,
  doc: NoteGraphDocInput | undefined,
  pt: { x: number; y: number },
  isCenter: boolean,
  typeColor: Map<string, string>,
  pal: ReturnType<typeof thinkingPalette>,
  isDark: boolean,
): GraphNode {
  const label = doc?.title ?? (path.split('/').at(-1) ?? path);
  const color = isCenter ? pal.accent : typeColor.get(doc?.type ?? '') ?? pal.accent;
  const style: NodeOpts = doc
    ? {
        fill: withAlpha(color, isDark ? (isCenter ? 0.34 : 0.2) : isCenter ? 0.26 : 0.15),
        stroke: color,
        strokeWidth: isCenter ? 2.6 : 2,
        fontColor: pal.text,
        fontSize: isCenter ? 14 : 13,
        fontStyle: isCenter ? 1 : 0,
        borderRadius: 8,
      }
    : {
        // 未解決（リポジトリ内に存在しない参照先）
        fill: 'transparent',
        stroke: withAlpha(pal.text, 0.4),
        strokeWidth: 1.5,
        fontColor: withAlpha(pal.text, 0.7),
        fontSize: 12,
        dashed: true,
        borderRadius: 8,
      };
  const node = mkNode(
    path,
    'rect',
    { x: pt.x - NODE_W / 2, y: pt.y - NODE_H / 2, width: NODE_W, height: NODE_H },
    label,
    style,
  );
  node.url = path;
  node.metadata = {
    path,
    ...(isCenter ? { center: 1 } : {}),
    ...(doc ? {} : { placeholder: 1 }),
  };
  return node;
}

/**
 * 現在のドキュメントを中心に据えた近傍グラフを構築する。
 *
 * 発リンク（`related` ∪ 本文 `.md` リンク）と被リンク（バックリンク）を、中心から
 * `hops` ホップの範囲に絞って表示する。グローバル表示の密集を避け、編集中の文脈に
 * 直結した関係を見せる。未解決参照はプレースホルダ化する。
 *
 * @param centerPath 中心に据える root 相対パス（docs に無くてもバックリンクは表示する）。
 */
export function buildNoteNeighborhood(
  docs: readonly NoteGraphDocInput[],
  centerPath: string,
  opts: NoteNeighborhoodOptions = {},
): GraphDocument {
  const isDark = opts.isDark ?? true;
  const hops = Math.max(1, opts.hops ?? 1);
  const includeBody = opts.includeBodyLinks ?? true;
  const pal = thinkingPalette(isDark);
  const typeColor = buildTypeColorMap(docs, isDark);
  const byPath = new Map(docs.map((d) => [d.path, d]));

  // 全有向エッジ（related 優先で kind を集約）。from/to はパスを分割せず値で保持する
  // （パスにセパレータ文字が含まれても壊れないようにするため）。改行はパスに現れない。
  const edgeMap = new Map<string, { from: string; to: string; kind: EdgeKind; relType?: RelationType }>();
  const addEdge = (from: string, to: string, kind: EdgeKind, relType?: RelationType): void => {
    if (from === to) return;
    const key = `${from}\n${to}`;
    if (edgeMap.get(key)?.kind === 'related') return;
    edgeMap.set(key, { from, to, kind, relType });
  };
  for (const d of docs) {
    for (const ref of d.related ?? []) {
      const { to, type } = normalizeRelated(ref);
      addEdge(d.path, to, 'related', type);
    }
    if (includeBody) for (const t of d.bodyLinks ?? []) addEdge(d.path, t, 'body');
  }

  // 無向隣接（バックリンク方向も辿る）
  const adj = new Map<string, Set<string>>();
  const linkAdj = (a: string, b: string): void => {
    const set = adj.get(a) ?? new Set<string>();
    set.add(b);
    adj.set(a, set);
  };
  for (const { from, to } of edgeMap.values()) {
    linkAdj(from, to);
    linkAdj(to, from);
  }

  // BFS で hops 内のノードと距離を求める
  const dist = new Map<string, number>([[centerPath, 0]]);
  let frontier = [centerPath];
  for (let h = 1; h <= hops; h++) {
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of adj.get(n) ?? []) {
        if (!dist.has(m)) {
          dist.set(m, h);
          next.push(m);
        }
      }
    }
    frontier = next;
  }
  const included = new Set(dist.keys());

  // 距離ごとにリング配置（中心は原点）
  const byDist = new Map<number, string[]>();
  for (const [p, dd] of dist) {
    const list = byDist.get(dd) ?? [];
    list.push(p);
    byDist.set(dd, list);
  }
  const nodes: GraphNode[] = [];
  for (const [dd, paths] of byDist) {
    if (dd === 0) {
      nodes.push(makeNeighborNode(centerPath, byPath.get(centerPath), { x: 0, y: 0 }, true, typeColor, pal, isDark));
      continue;
    }
    const ring = ringPoints(paths.length, { radius: NEIGHBOR_RING_STEP * dd });
    paths.forEach((p, i) => {
      nodes.push(makeNeighborNode(p, byPath.get(p), ring[i] ?? { x: 0, y: 0 }, false, typeColor, pal, isDark));
    });
  }

  // included 内のエッジのみ
  const edges: GraphEdge[] = [];
  let edgeIndex = 0;
  for (const { from, to, kind, relType } of edgeMap.values()) {
    if (!included.has(from) || !included.has(to)) continue;
    if (kind === 'related') {
      const rs = relationEdgeStyle(relType ?? 'references', pal);
      edges.push(
        connectorEdge(`nbEdge${edgeIndex++}`, from, to, {
          stroke: rs.stroke,
          strokeWidth: rs.strokeWidth,
          dashed: rs.dashed,
          endShape: rs.endShape,
          label: rs.label,
        }),
      );
    } else {
      // 本文 `.md` リンク（型なしの弱い関係）
      edges.push(
        connectorEdge(`nbEdge${edgeIndex++}`, from, to, {
          stroke: withAlpha(pal.text, 0.45),
          strokeWidth: 1.3,
          endShape: 'arrow',
        }),
      );
    }
  }

  const doc = mkDoc('note-neighborhood', nodes, edges);
  doc.id = 'note-neighborhood';
  return doc;
}
