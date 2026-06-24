import { createHash } from 'node:crypto';

export interface CodeGraphRepository {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export type EdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

/**
 * アーキテクチャ層のローカルミラー。
 *
 * code-analysis-core の `ArchitectureLayer`（`@anytime-markdown/code-analysis-core/architecture`）と
 * 同一メンバーを **import せず** ここで複製する。trail-core を解析パッケージから疎結合に保つための
 * 意図的なミラー（`relations.ts` 等の既存ミラー前例に倣う）。
 *
 * ミラーずれ防止:
 * - core 側が層を増減した場合、trail-server で `classifyLayer(...).layer`（core の union）を
 *   `CodeGraphNode.layer`（本ミラー）へ代入する箇所が型非互換でビルド失敗し検出される。
 * - 本配列自体の誤編集（メンバー増減）は trail-core の 9 メンバー固定テストで検出される。
 */
export const ARCHITECTURE_LAYERS = [
  'foundation',
  'analysis',
  'data',
  'service-domain',
  'service-server',
  'integration',
  'presentation-ui',
  'presentation-extension',
  'utility',
] as const;

/** アーキテクチャ層。モジュール（パッケージ）単位の分類結果。code-analysis-core の同名型のミラー。 */
export type ArchitectureLayer = (typeof ARCHITECTURE_LAYERS)[number];

export interface CodeGraphNode {
  readonly id: string;
  readonly label: string;
  readonly repo: string;
  readonly package: string;
  readonly fileType: 'code' | 'document';
  readonly community: number;
  readonly communityLabel: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /**
   * アーキテクチャ層（任意）。trail-server の解析パイプラインがパッケージ単位で付与する。
   * 旧グラフ（未付与）との後方互換のため optional。JSON シリアライズで graph_json に保存される。
   */
  readonly layer?: ArchitectureLayer;
}

export interface CodeGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly confidence: EdgeConfidence;
  readonly confidence_score: number;
  readonly crossRepo: boolean;
}

export interface CommunitySummary {
  /** AI が生成した 3 語以内の表示名 */
  readonly name: string;
  /** AI が生成した 1 文 60 文字以内の説明 */
  readonly summary: string;
}

export interface CodeGraph {
  readonly generatedAt: string;
  readonly repositories: readonly CodeGraphRepository[];
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
  readonly communities: Record<number, string>;
  readonly godNodes: readonly string[];
  /**
   * AI 生成のコミュニティ要約（任意）。
   * /build-code-graph スキル経由で生成。VS Code 拡張の Generate Code Graph 単独では未生成。
   */
  readonly communitySummaries?: Record<number, CommunitySummary>;
}

export interface CodeGraphQueryResult {
  readonly nodes: readonly string[];
  readonly edges: Array<{ source: string; target: string }>;
}

export interface CodeGraphExplainResult {
  readonly node: CodeGraphNode;
  readonly incoming: readonly CodeGraphEdge[];
  readonly outgoing: readonly CodeGraphEdge[];
}

export interface CodeGraphPathResult {
  readonly found: boolean;
  readonly path: readonly string[];
  readonly hops: number;
}

// ---------------------------------------------------------------------------
// DB 分割保存用の型とヘルパー
// ---------------------------------------------------------------------------

/** DB 保存用 CodeGraph（communities / communitySummaries を除いたサブセット） */
export interface StoredCodeGraph {
  readonly generatedAt: string;
  readonly repositories: readonly CodeGraphRepository[];
  readonly nodes: readonly CodeGraphNode[];
  readonly edges: readonly CodeGraphEdge[];
  readonly godNodes: readonly string[];
}

/** コミュニティ行の型（DB の `*_code_graph_communities` テーブル 1 行に対応） */
export interface StoredCommunity {
  readonly id: number;
  readonly label: string;
  readonly name: string;
  readonly summary: string;
  /**
   * コミュニティ内ノード ID 集合のコンテンツハッシュ（v1: sha256 先頭 16hex）。
   * community_id は Louvain 検出順の連番で再解析のたびに変動するが、stableKey は
   * 「同じノード集合 → 同じキー」を保証する。AI 付与した name / summary / mappings_json を
   * community_id の再採番から守るための引き継ぎキー。
   */
  readonly stableKey: string;
}

// stable_key 算出ロジック
// ---------------------------------------------------------------------------

/**
 * stable_key のフォーマットバージョン。
 * 上げると同一ノード集合でもキーが変わるため、全コミュニティの migration が必要になる。
 */
export const STABLE_KEY_VERSION = 'v1';

/**
 * コミュニティ内ノード ID 集合からコンテンツハッシュ（stable_key）を算出する。
 *
 * - 入力は順序非依存（Set + sort）
 * - パスセパレータ（`\` → `/`）と Unicode 正規化（NFC）で OS 差を吸収
 * - ノード ID の `<repo>:` プレフィックスは取り除く（リポジトリ名変更耐性）
 * - SHA-256 の先頭 16 hex（64 bit）を採用（786 件規模で衝突確率実質ゼロ）
 *
 * @param memberNodeIds コミュニティに属するノード ID 配列（順序・重複問わず）
 * @returns 16 文字の hex 文字列
 */
export function computeStableKey(memberNodeIds: readonly string[]): string {
  const normalized = memberNodeIds.map(normalizeNodeId);
  const sorted = [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
  const payload = `${STABLE_KEY_VERSION}\n${sorted.join('\n')}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

function normalizeNodeId(nodeId: string): string {
  const colon = nodeId.indexOf(':');
  const relPath = colon >= 0 ? nodeId.slice(colon + 1) : nodeId;
  return relPath.replaceAll('\\', '/').trim().normalize('NFC');
}

/**
 * CodeGraph を DB 保存用の 2 つの部品に分割する。
 *
 * @returns stored - communities / communitySummaries を除いた保存用サブセット
 * @returns communities - community メタ行の配列（コミュニティ行テーブルに 1 行ずつ保存する）
 */
export function splitCodeGraph(full: CodeGraph): {
  stored: StoredCodeGraph;
  communities: ReadonlyArray<StoredCommunity>;
} {
  const stored: StoredCodeGraph = {
    generatedAt: full.generatedAt,
    repositories: full.repositories,
    nodes: full.nodes,
    edges: full.edges,
    godNodes: full.godNodes,
  };

  // 各コミュニティに属するノード ID を集計（stable_key 算出に必要）
  const memberIdsByCommunity = new Map<number, string[]>();
  for (const n of full.nodes) {
    const arr = memberIdsByCommunity.get(n.community);
    if (arr) arr.push(n.id);
    else memberIdsByCommunity.set(n.community, [n.id]);
  }

  const communities: StoredCommunity[] = Object.entries(full.communities).map(
    ([idStr, label]) => {
      const id = Number(idStr);
      const cs = full.communitySummaries?.[id];
      const memberIds = memberIdsByCommunity.get(id) ?? [];
      return {
        id,
        label,
        name: cs?.name ?? '',
        summary: cs?.summary ?? '',
        stableKey: computeStableKey(memberIds),
      };
    }
  );

  return { stored, communities };
}

/**
 * splitCodeGraph で分割した部品から元の CodeGraph を復元する。
 *
 * name === '' && summary === '' のエントリは communitySummaries に含めない
 * （任意フィールドの再現）。
 */
export function composeCodeGraph(
  stored: StoredCodeGraph,
  communities: ReadonlyArray<StoredCommunity>
): CodeGraph {
  const communitiesRecord: Record<number, string> = {};
  const summariesRecord: Record<number, CommunitySummary> = {};

  for (const c of communities) {
    communitiesRecord[c.id] = c.label;
    if (c.name !== '' || c.summary !== '') {
      summariesRecord[c.id] = { name: c.name, summary: c.summary };
    }
  }

  const hasSummaries = Object.keys(summariesRecord).length > 0;

  return {
    generatedAt: stored.generatedAt,
    repositories: stored.repositories,
    nodes: stored.nodes,
    edges: stored.edges,
    godNodes: stored.godNodes,
    communities: communitiesRecord,
    ...(hasSummaries ? { communitySummaries: summariesRecord } : {}),
  };
}
