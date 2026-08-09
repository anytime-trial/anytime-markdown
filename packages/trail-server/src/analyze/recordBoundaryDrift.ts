import type {
  BoundaryDriftThresholds,
  BoundaryDriftWarning,
} from '@anytime-markdown/trail-activity/domain/model';
import { DEFAULT_BOUNDARY_DRIFT_THRESHOLDS } from '@anytime-markdown/trail-activity/domain/model';
import { detectBoundaryDrift } from '@anytime-markdown/trail-activity/domain/usecase';
import { computeStableKey } from '@anytime-markdown/trail-activity/codeGraph';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import type { Logger } from '../runtime/Logger';
import type { CodeGraph } from './CodeGraph.types';

/**
 * 本ステップが使う DB 機能だけの契約。TrailDatabase 全体を要求しないのは、
 * テストが 2 メソッドのスタブで済むようにするため。
 */
export type BoundaryDriftRecorder = Pick<
  TrailDatabase,
  'repoIdForName' | 'recordBoundaryDriftWarnings'
>;

export interface RecordBoundaryDriftArgs {
  readonly repoName: string;
  /** 解析直後のコードグラフ。community 付与済みであることが前提（generate 後に呼ぶ）。 */
  readonly graph: CodeGraph | null;
  readonly trailDb: BoundaryDriftRecorder;
  readonly logger: Logger;
  /** パイプラインの警告収集配列。失敗時に理由を積む（呼び出し側が結果へ載せる）。 */
  readonly warnings: string[];
  readonly thresholds?: BoundaryDriftThresholds;
}

/**
 * 宣言境界と実装コミュニティのずれを判定し activity_boundary_drift_warnings へ記録する。
 *
 * fail-open。判定・保存の失敗は解析パイプラインを止めない（コードグラフ本体と
 * C4 モデルは既に保存済みで、本ステップは付随指標のため）。ただし握りつぶさず、
 * repo 名付きで error ログへ出し warnings へも積む。
 *
 * @returns 実際に挿入した行数。判定を実行しなかった場合（グラフ無し）と失敗時は null。
 */
export function recordBoundaryDrift(args: RecordBoundaryDriftArgs): number | null {
  const { repoName, graph, trailDb, logger, warnings } = args;
  const thresholds = args.thresholds ?? DEFAULT_BOUNDARY_DRIFT_THRESHOLDS;

  if (!graph || graph.nodes.length === 0) {
    logger.info(`C4 analysis [${repoName}]: boundary drift skipped (no code graph nodes)`);
    return null;
  }

  try {
    const detected = detectBoundaryDrift(graph.nodes, thresholds);
    const repoId = trailDb.repoIdForName(repoName);
    const inserted = trailDb.recordBoundaryDriftWarnings(
      repoId,
      graph.generatedAt,
      detected,
      stableKeysForSpanning(graph, detected),
      graph.nodes.length,
    );
    const spanning = detected.filter((w) => w.kind === 'boundary_spanning').length;
    logger.info(
      `C4 analysis [${repoName}]: boundary drift warnings=${detected.length} ` +
        `(spanning=${spanning} fragmentation=${detected.length - spanning}) inserted=${inserted}`,
    );
    return inserted;
  } catch (err) {
    const msg = `boundary drift detection failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(`C4 analysis [${repoName}]: ${msg}`, err);
    warnings.push(msg);
    return null;
  }
}

/**
 * boundary_spanning 警告のコミュニティだけ stable_key を算出する。
 *
 * community_id は再クラスタリングのたびに採番が変わるため、履歴を跨いで
 * 「同じ塊がまだ跨いでいるか」を追うには内容由来のキーが要る。全コミュニティ分を
 * 計算する splitCodeGraph は使わない（警告は 141 中 10 件程度で、残りは捨てる計算になる）。
 */
function stableKeysForSpanning(
  graph: CodeGraph,
  detected: readonly BoundaryDriftWarning[],
): ReadonlyMap<number, string> {
  const targets = new Set(
    detected.flatMap((w) => (w.kind === 'boundary_spanning' ? [w.communityId] : [])),
  );
  if (targets.size === 0) return new Map();

  const memberIds = new Map<number, string[]>();
  for (const node of graph.nodes) {
    if (!targets.has(node.community)) continue;
    const ids = memberIds.get(node.community);
    if (ids) ids.push(node.id);
    else memberIds.set(node.community, [node.id]);
  }

  const out = new Map<number, string>();
  for (const [communityId, ids] of memberIds) out.set(communityId, computeStableKey(ids));
  return out;
}
