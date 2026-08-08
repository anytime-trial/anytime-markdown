import { computeConfidenceCoupling } from './computeConfidenceCoupling';
import type {
  ComputeConfidenceCouplingOptions,
  ConfidenceCouplingEdge,
  GroupedFileRow,
  SubagentTypeFileRow,
} from './types';

/**
 * subagent_type 粒度の Confidence (方向性) Temporal Coupling を計算するアダプタ。
 * `subagentType` を `groupKey` として `computeConfidenceCoupling` に委譲する。
 * 役割（general-purpose / Explore / code-reviewer 等）間で
 * 「どちらのファイル群が他方を引きずっているか」を可視化する。
 */
export function computeSubagentTypeConfidenceCoupling(
  rows: ReadonlyArray<SubagentTypeFileRow>,
  options: ComputeConfidenceCouplingOptions,
): ConfidenceCouplingEdge[] {
  if (rows.length === 0) return [];
  const grouped: GroupedFileRow[] = rows.map((r) => ({
    groupKey: r.subagentType,
    filePath: r.filePath,
  }));
  return computeConfidenceCoupling(grouped, options);
}
