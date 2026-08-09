import { computeConfidenceCoupling } from './computeConfidenceCoupling';
import type {
  ComputeConfidenceCouplingOptions,
  ConfidenceCouplingEdge,
  GroupedFileRow,
  SessionFileRow,
} from './types';

/**
 * セッション粒度の Confidence (方向性) Temporal Coupling を計算するアダプタ。
 * `sessionId` を `groupKey` として `computeConfidenceCoupling` に委譲する。
 */
export function computeSessionConfidenceCoupling(
  rows: ReadonlyArray<SessionFileRow>,
  options: ComputeConfidenceCouplingOptions,
): ConfidenceCouplingEdge[] {
  if (rows.length === 0) return [];
  const grouped: GroupedFileRow[] = rows.map((r) => ({
    groupKey: r.sessionId,
    filePath: r.filePath,
  }));
  return computeConfidenceCoupling(grouped, options);
}
