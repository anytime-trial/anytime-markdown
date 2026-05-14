/**
 * コードグラフコミュニティの引き継ぎ計算。
 *
 * 背景:
 *  current_code_graph_communities.mappings_json は (repo_name, community_id) をキーに保存される。
 *  Louvain クラスタリング結果が変わると community_id が再採番され、旧行は DELETE / 新行は NULL で INSERT
 *  されてしまうため、AI 付与した name / summary / mappings_json が機械的に失われる。
 *
 * このモジュールは「旧コミュニティ → 新コミュニティ」の対応付けを 2 段階で行う:
 *  1. **stable_key 完全一致**（ノード集合コンテンツハッシュ）: コード無変更 / リネームのみのケースで即継承
 *  2. **ジャッカード類似度フォールバック**: コード差分でノード集合が部分的に変わったケースで類似度上位を引き継ぎ
 *
 * stable_key は packages/trail-core/src/codeGraph.ts の `computeStableKey` で算出される。
 */

/** 旧スナップショット（書き込み前に DB から読み出した行）。 */
export interface OldCommunity {
  /** 旧 community_id（再採番されるとほぼ意味を失う識別子だが、ログ用に保持） */
  readonly communityId: number;
  /** ノード集合のコンテンツハッシュ。空文字なら古いスキーマ由来で stableKey 未付与 */
  readonly stableKey: string;
  /** 旧コミュニティに属していたノード ID の集合（ジャッカード計算用） */
  readonly members: ReadonlySet<string>;
  readonly name: string;
  readonly summary: string;
  readonly mappingsJson: string | null;
}

/** 新スナップショット（これから DB へ書き込もうとしている分）。 */
export interface NewCommunity {
  readonly id: number;
  readonly stableKey: string;
  readonly members: ReadonlySet<string>;
}

/** 引き継ぎ結果。新 community_id をキーに、旧コミュニティの AI 付与値を返す。 */
export interface CarryOverEntry {
  readonly name: string;
  readonly summary: string;
  readonly mappingsJson: string | null;
  /** 引き継ぎ判定の根拠。テレメトリ・デバッグ用 */
  readonly source: 'exact' | 'jaccard';
  /** ジャッカード経路の場合の類似度 (0〜1)。exact 経路では 1 */
  readonly similarity: number;
}

export interface ResolveCarryOverOptions {
  /**
   * ジャッカード類似度の継承閾値（0〜1）。デフォルト 0.7。
   * 0.5 だと過剰引き継ぎ（別物が混じる）、0.9 だと過剰再生成（軽微な差分でも引き継ぎ失敗）になる。
   */
  readonly jaccardThreshold?: number;
}

/**
 * 旧コミュニティ群と新コミュニティ群から、新 community_id ごとの引き継ぎ表を構築する。
 *
 * @param oldCommunities 旧スナップショット（DB から読み出した行 + members 集合）
 * @param newCommunities 新スナップショット（これから書き込む行 + members 集合）
 * @param options.jaccardThreshold ジャッカード継承閾値（デフォルト 0.7）
 * @returns Map<新 community_id, CarryOverEntry>
 */
export function resolveCarryOver(
  oldCommunities: readonly OldCommunity[],
  newCommunities: readonly NewCommunity[],
  options: ResolveCarryOverOptions = {},
): Map<number, CarryOverEntry> {
  const threshold = options.jaccardThreshold ?? 0.7;
  const result = new Map<number, CarryOverEntry>();

  // Step 1: stable_key 完全一致（O(N + M)）
  // 旧 stableKey → 旧コミュニティ の Map を作っておき、新コミュニティを走査して即引き
  const oldByKey = new Map<string, OldCommunity>();
  for (const o of oldCommunities) {
    if (o.stableKey !== '' && !oldByKey.has(o.stableKey)) {
      oldByKey.set(o.stableKey, o);
    }
  }
  const matchedOldIds = new Set<number>();
  for (const n of newCommunities) {
    if (n.stableKey === '') continue;
    const o = oldByKey.get(n.stableKey);
    if (!o) continue;
    if (matchedOldIds.has(o.communityId)) continue; // 1 つの旧が 2 つの新にマッチした場合は最初の 1 つだけ
    result.set(n.id, {
      name: o.name,
      summary: o.summary,
      mappingsJson: o.mappingsJson,
      source: 'exact',
      similarity: 1,
    });
    matchedOldIds.add(o.communityId);
  }

  // Step 2: 残った旧コミュニティをジャッカード類似度で fallback マッチング
  const unmatchedOld = oldCommunities.filter((o) => !matchedOldIds.has(o.communityId));
  const unmatchedNew = newCommunities.filter((n) => !result.has(n.id));
  if (unmatchedOld.length === 0 || unmatchedNew.length === 0) return result;

  // 旧側から見て「最も類似度の高い新」を探す貪欲法。
  // 旧 → 新 の片側貪欲なので、1 つの新が複数の旧の候補になる可能性がある。
  // その場合は「最も類似度の高い旧」が勝つよう、決定済みのエントリは類似度比較で上書き可能にする。
  for (const o of unmatchedOld) {
    let best: { newId: number; jaccard: number } | undefined;
    for (const n of unmatchedNew) {
      const j = jaccardSimilarity(o.members, n.members);
      if (!best || j > best.jaccard) {
        best = { newId: n.id, jaccard: j };
      }
    }
    if (!best || best.jaccard < threshold) continue;
    const existing = result.get(best.newId);
    if (existing && existing.similarity >= best.jaccard) continue; // 既存が同等以上ならスキップ
    result.set(best.newId, {
      name: o.name,
      summary: o.summary,
      mappingsJson: o.mappingsJson,
      source: 'jaccard',
      similarity: best.jaccard,
    });
  }

  return result;
}

/**
 * 2 つの集合のジャッカード類似度 |A ∩ B| / |A ∪ B| を計算する。
 * 両方空集合の場合は 0（未定義のため）。
 */
export function jaccardSimilarity<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  // 小さい方を走査して効率化
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) {
    if (large.has(x)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
