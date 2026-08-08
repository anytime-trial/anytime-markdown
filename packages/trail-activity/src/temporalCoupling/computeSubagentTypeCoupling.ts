import { aggregatePairs, PAIR_KEY_SEPARATOR, normalizePair } from './aggregatePairs';
import type {
  ComputeTemporalCouplingOptions,
  SubagentTypeFileRow,
  TemporalCouplingEdge,
} from './types';

/**
 * subagent_type 粒度の Temporal Coupling を計算するアダプタ。
 * `aggregatePairs` を再利用し、`subagentType` を `groupKey` として扱う。
 * 役割（general-purpose / Explore / code-reviewer 等）ごとに「触ったファイル集合」を集約し、
 * 役割間の領域重なりを Jaccard 係数で可視化する。
 */
export function computeSubagentTypeCoupling(
  rows: ReadonlyArray<SubagentTypeFileRow>,
  options: ComputeTemporalCouplingOptions,
): TemporalCouplingEdge[] {
  if (rows.length === 0) return [];

  const {
    minChangeCount,
    jaccardThreshold,
    topK,
    maxFilesPerCommit,
    excludePairs,
    pathFilter,
  } = options;

  const groupedRows = rows.map((r) => ({
    groupKey: r.subagentType,
    filePath: r.filePath,
  }));

  const { fileChangeCount, coChange } = aggregatePairs(groupedRows, {
    minChangeCount,
    maxFilesPerGroup: maxFilesPerCommit,
    excludePairs,
    pathFilter,
  });

  const edges: TemporalCouplingEdge[] = [];
  for (const [key, co] of coChange) {
    const [a, b] = key.split(PAIR_KEY_SEPARATOR);
    const [source, target] = normalizePair(a, b);
    const sourceChangeCount = fileChangeCount.get(source) ?? 0;
    const targetChangeCount = fileChangeCount.get(target) ?? 0;
    const union = sourceChangeCount + targetChangeCount - co;
    if (union <= 0) continue;
    const jaccard = co / union;
    if (jaccard < jaccardThreshold) continue;
    edges.push({
      source,
      target,
      coChangeCount: co,
      sourceChangeCount,
      targetChangeCount,
      jaccard,
    });
  }

  edges.sort((x, y) => {
    if (y.jaccard !== x.jaccard) return y.jaccard - x.jaccard;
    if (y.coChangeCount !== x.coChangeCount) return y.coChangeCount - x.coChangeCount;
    if (x.source !== y.source) return x.source < y.source ? -1 : 1;
    return x.target < y.target ? -1 : 1;
  });

  return edges.slice(0, topK);
}
