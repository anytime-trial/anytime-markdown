import { aggregatePairs, PAIR_KEY_SEPARATOR, normalizePair } from './aggregatePairs';
import type {
  CommitFileRow,
  ComputeConfidenceCouplingOptions,
  ConfidenceCouplingEdge,
  CouplingDirection,
  GroupedFileRow,
} from './types';

export function computeConfidenceCoupling(
  rows: ReadonlyArray<CommitFileRow>,
  options: ComputeConfidenceCouplingOptions,
): ConfidenceCouplingEdge[];
export function computeConfidenceCoupling(
  rows: ReadonlyArray<GroupedFileRow>,
  options: ComputeConfidenceCouplingOptions,
): ConfidenceCouplingEdge[];
export function computeConfidenceCoupling(
  rows: ReadonlyArray<CommitFileRow | GroupedFileRow>,
  options: ComputeConfidenceCouplingOptions,
): ConfidenceCouplingEdge[] {
  if (rows.length === 0) return [];

  const {
    minChangeCount,
    confidenceThreshold,
    directionalDiffThreshold,
    topK,
    maxFilesPerCommit,
    excludePairs,
    pathFilter,
  } = options;

  const groupedRows: GroupedFileRow[] = rows.map((r) =>
    'commitHash' in r
      ? { groupKey: r.commitHash, filePath: r.filePath }
      : { groupKey: r.groupKey, filePath: r.filePath },
  );

  const { fileChangeCount, coChange } = aggregatePairs(groupedRows, {
    minChangeCount,
    maxFilesPerGroup: maxFilesPerCommit,
    excludePairs,
    pathFilter,
  });

  const edges: ConfidenceCouplingEdge[] = [];
  for (const [key, co] of coChange) {
    const [a, b] = key.split(PAIR_KEY_SEPARATOR);
    const [lo, hi] = normalizePair(a, b);
    const loCount = fileChangeCount.get(lo) ?? 0;
    const hiCount = fileChangeCount.get(hi) ?? 0;
    if (loCount <= 0 || hiCount <= 0) continue;

    const confLoToHi = co / loCount;
    const confHiToLo = co / hiCount;
    const diff = Math.abs(confLoToHi - confHiToLo);

    const union = loCount + hiCount - co;
    const jaccard = union > 0 ? co / union : 0;

    let direction: CouplingDirection;
    let source: string;
    let target: string;
    let confidenceForward: number;
    let confidenceBackward: number;
    let sourceChangeCount: number;
    let targetChangeCount: number;

    if (diff >= directionalDiffThreshold) {
      if (confLoToHi > confHiToLo) {
        direction = 'A→B';
        source = lo;
        target = hi;
        confidenceForward = confLoToHi;
        confidenceBackward = confHiToLo;
        sourceChangeCount = loCount;
        targetChangeCount = hiCount;
      } else {
        direction = 'A→B';
        source = hi;
        target = lo;
        confidenceForward = confHiToLo;
        confidenceBackward = confLoToHi;
        sourceChangeCount = hiCount;
        targetChangeCount = loCount;
      }
    } else {
      direction = 'undirected';
      source = lo;
      target = hi;
      confidenceForward = confLoToHi;
      confidenceBackward = confHiToLo;
      sourceChangeCount = loCount;
      targetChangeCount = hiCount;
    }

    if (confidenceForward < confidenceThreshold) continue;

    edges.push({
      source,
      target,
      direction,
      confidenceForward,
      confidenceBackward,
      coChangeCount: co,
      sourceChangeCount,
      targetChangeCount,
      jaccard,
    });
  }

  edges.sort((x, y) => {
    if (y.confidenceForward !== x.confidenceForward) {
      return y.confidenceForward - x.confidenceForward;
    }
    if (y.coChangeCount !== x.coChangeCount) {
      return y.coChangeCount - x.coChangeCount;
    }
    if (x.source !== y.source) return x.source < y.source ? -1 : 1;
    return x.target < y.target ? -1 : 1;
  });

  return edges.slice(0, topK);
}
