/**
 * `/api/caravan/knowledge-graph` 応答 → CooccurrenceFile 変換（純粋関数）。
 *
 * 画面設計書: spec/31.trail/02.trail-viewer/trail-viewer-screen/trail-viewer-screen-knowledge-graph.ja.md §3.3
 */

import { computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { CooccurrenceLinkTuple } from '@anytime-markdown/graph-core';

export interface KnowledgeGraphNodeDto {
  readonly label: string;
  readonly type: string;
  /** アクティブエッジ次数。円の面積に比例させる。 */
  readonly frequency: number;
  /**
   * サーバが計算した世界座標（`caravan_entity_layout`）。全ノードに揃っている時だけ
   * クライアントはレイアウト計算を省略する。
   */
  readonly x?: number;
  readonly y?: number;
}

export interface KnowledgeGraphLinkDto {
  /** nodes の添字。 */
  readonly a: number;
  readonly b: number;
  /** ペア間の有効エッジ本数。 */
  readonly strength: number;
}

export interface KnowledgeGraphClusterDto {
  readonly label: string;
  readonly members: readonly number[];
}

export interface KnowledgeGraphResponse {
  readonly nodes: readonly KnowledgeGraphNodeDto[];
  readonly links: readonly KnowledgeGraphLinkDto[];
  readonly clusters: readonly KnowledgeGraphClusterDto[];
  /** 種別フィルタ適用後の全エンティティ数（表示が全体の一部であることを示す分母）。 */
  readonly totalEntityCount: number;
  readonly truncated: boolean;
  /** 種別フィルタ UI の選択肢（DB に実在する全種別。フィルタの影響を受けない）。 */
  readonly availableTypes: readonly string[];
  /**
   * 要求した視野（bbox）でサーバが実際に絞ったか。座標が 1 件も無い DB では絞れないため
   * false になる。false のときに視野駆動の再取得を続けても結果は変わらない。
   */
  readonly bboxApplied?: boolean;
}

/**
 * ラベルを一意化する。共起図の識別子は添字だが、同名ラベルが並ぶと人が図を読めない。
 * 衝突時は `label (type)`、それでも衝突する同種別の重複には出現順の序数を付ける。
 */
function disambiguateLabels(nodes: readonly KnowledgeGraphNodeDto[]): string[] {
  const labelCounts = new Map<string, number>();
  for (const node of nodes) {
    labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return nodes.map((node) => {
    const base = (labelCounts.get(node.label) ?? 0) > 1 ? `${node.label} (${node.type})` : node.label;
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    return nth === 1 ? base : `${base} #${nth}`;
  });
}

export function buildKnowledgeGraphCoocFile(
  response: KnowledgeGraphResponse,
  generatedAt: string,
): CooccurrenceFile {
  const labels = disambiguateLabels(response.nodes);
  const nodeCount = response.nodes.length;

  // 範囲外添字・自己ループは黙って捨てるのではなく図を壊さないために除外する。
  // サーバが正しければ空振りする防御で、除外がテスト対象（設計書 §3.3）。
  const links: CooccurrenceLinkTuple[] = [];
  for (const link of response.links) {
    if (link.a === link.b) continue;
    if (!Number.isInteger(link.a) || link.a < 0 || link.a >= nodeCount) continue;
    if (!Number.isInteger(link.b) || link.b < 0 || link.b >= nodeCount) continue;
    links.push([link.a, link.b, link.strength]);
  }

  const spec = {
    nodes: response.nodes.map((node, i) => ({ label: labels[i], frequency: node.frequency })),
    links,
    clusters: response.clusters
      .filter((cluster) => cluster.members.length > 0)
      .map((cluster) => ({ label: cluster.label, members: [...cluster.members] })),
  };

  return {
    meta: {
      // 無向・メモなし・時間軸なしのため版数 1（graph-core schemaVersionForSpec と同じ規則）
      schemaVersion: 1,
      generatedAt,
      origin: 'mcp',
    },
    spec,
    ...buildServerLayout(response, spec),
  };
}

/**
 * サーバが座標を返しているなら `layout` を組む。ビューアはこれを見てレイアウト計算を丸ごと
 * 省略する（`layout.source = 'server'`）。
 *
 * **1 件でも座標が欠けたら何も返さない**。座標のある点と無い点が混ざると、無い点だけが
 * 原点に固まった図になる。全部あるか、全部クライアントで計算するかの二択にする。
 */
function buildServerLayout(
  response: KnowledgeGraphResponse,
  spec: CooccurrenceFile['spec'],
): Pick<CooccurrenceFile, 'layout'> | Record<string, never> {
  const positions: Array<[number, number]> = [];
  for (const node of response.nodes) {
    if (typeof node.x !== 'number' || typeof node.y !== 'number') return {};
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return {};
    positions.push([node.x, node.y]);
  }
  if (positions.length === 0) return {};
  return {
    layout: {
      positions,
      specHash: computeSpecHash(spec),
      // サーバ側は ForceAtlas2。source: 'server' の間、ビューアはこの値を照合しない
      // （graph-core の CooccurrenceFile.layout 参照）が、由来が読めるよう実名を書く。
      algorithmVersion: 'server-forceatlas2-v1',
      source: 'server',
    },
  };
}
