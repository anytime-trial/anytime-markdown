import type {
  BoundaryDriftBreakdownEntry,
  BoundaryDriftNode,
  BoundaryDriftThresholds,
  BoundaryDriftWarning,
} from '../model/boundaryDrift';

/**
 * 宣言境界（パッケージ）と実装凝集（コミュニティ）を対照し、ずれを警告として返す。
 *
 * 純粋関数。入力はコードグラフのノードのうち `package` と `community` だけで、
 * エッジもグラフライブラリも要らない。両属性は同一の `graph_json` に同居している。
 *
 * 仕様は spec/31.trail/03.trail-core/architectural-drift-detection.ja.md。
 */
export function detectBoundaryDrift(
  nodes: readonly BoundaryDriftNode[],
  thresholds: BoundaryDriftThresholds,
): readonly BoundaryDriftWarning[] {
  const warnings: BoundaryDriftWarning[] = [
    ...detectSpanning(groupBy(nodes, (n) => n.community, (n) => n.package), thresholds),
    ...detectFragmentation(groupBy(nodes, (n) => n.package, (n) => String(n.community)), thresholds),
  ];

  // 同一 severity では kind → 対象キーの順で安定させる（再実行で並びが揺れないように）。
  return warnings.sort(
    (a, b) => b.severity - a.severity || a.kind.localeCompare(b.kind) || targetKey(a).localeCompare(targetKey(b)),
  );
}

/** 警告の対象キー。boundary_spanning はコミュニティ id、package_fragmentation はパッケージ名。 */
export function targetKey(warning: BoundaryDriftWarning): string {
  return warning.kind === 'boundary_spanning' ? String(warning.communityId) : warning.packageName;
}

function detectSpanning(
  byCommunity: Map<string, Map<string, number>>,
  thresholds: BoundaryDriftThresholds,
): BoundaryDriftWarning[] {
  const out: BoundaryDriftWarning[] = [];

  for (const [communityId, packageCounts] of byCommunity) {
    const spanCount = packageCounts.size;
    if (spanCount < thresholds.minSpanCount) continue;

    const breakdown = toBreakdown(packageCounts);
    const nodeCount = breakdown.reduce((sum, e) => sum + e.nodeCount, 0);
    // breakdown は降順なので先頭が最多パッケージ。nodeCount は 1 以上（キーが存在する＝1 件以上ある）。
    const dominance = breakdown[0].nodeCount / nodeCount;
    if (dominance >= thresholds.maxDominance) continue;

    out.push({
      kind: 'boundary_spanning',
      communityId: Number(communityId),
      spanCount,
      dominance,
      nodeCount,
      // 跨ぐパッケージが多いほど、また混ざり合っているほど高い。
      severity: spanCount * (1 - dominance),
      breakdown,
    });
  }

  return out;
}

function detectFragmentation(
  byPackage: Map<string, Map<string, number>>,
  thresholds: BoundaryDriftThresholds,
): BoundaryDriftWarning[] {
  const out: BoundaryDriftWarning[] = [];

  for (const [packageName, communityCounts] of byPackage) {
    const communityCount = communityCounts.size;
    if (communityCount < thresholds.minCommunityCount) continue;

    const breakdown = toBreakdown(communityCounts);
    out.push({
      kind: 'package_fragmentation',
      packageName,
      communityCount,
      nodeCount: breakdown.reduce((sum, e) => sum + e.nodeCount, 0),
      severity: communityCount,
      breakdown,
    });
  }

  return out;
}

/** 外側キーごとに、内側キーの出現数を数える。 */
function groupBy(
  nodes: readonly BoundaryDriftNode[],
  outer: (node: BoundaryDriftNode) => string | number,
  inner: (node: BoundaryDriftNode) => string,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  for (const node of nodes) {
    const outerKey = String(outer(node));
    let counts = result.get(outerKey);
    if (!counts) {
      counts = new Map<string, number>();
      result.set(outerKey, counts);
    }
    const innerKey = inner(node);
    counts.set(innerKey, (counts.get(innerKey) ?? 0) + 1);
  }

  return result;
}

/** ノード数の降順。同数はキーの昇順で安定させる。 */
function toBreakdown(counts: Map<string, number>): BoundaryDriftBreakdownEntry[] {
  return [...counts.entries()]
    .map(([key, nodeCount]) => ({ key, nodeCount }))
    .sort((a, b) => b.nodeCount - a.nodeCount || a.key.localeCompare(b.key));
}
