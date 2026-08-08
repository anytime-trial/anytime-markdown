import type {
  AuthorHeatmapEntry,
  ComputeAuthorHeatmapOptions,
  FileSessionCommitRow,
} from './types';

type NodeAccumulator = {
  /** セッション → そのセッションが触れたコミット集合（同一コミットの重複を吸収する） */
  readonly commitsBySession: Map<string, Set<string>>;
  /** 全セッション横断のコミット集合 */
  readonly allCommits: Set<string>;
  lastEditedAt: string;
  lastCommitHash: string;
  lastSessionId: string;
};

/**
 * 最終編集の勝者を決める。`committedAt` の降順、同値は `commitHash` の昇順。
 *
 * Why not 到着順: 同時刻のコミットが並ぶと行の並び順で結果が変わり、再取得のたびに
 * ノード色がちらつく。タイブレークを固定して描画を決定論的にする。
 */
function isNewerEdit(
  committedAt: string,
  commitHash: string,
  currentAt: string,
  currentHash: string,
): boolean {
  if (committedAt !== currentAt) return committedAt > currentAt;
  return commitHash < currentHash;
}

/**
 * コードグラフのノードごとに、最終編集セッション・編集頻度・属人度を集計する。
 *
 * 入力は行の配列だけを取る純粋関数で、DB にもコードグラフの実体にも依存しない
 * （ノード ID への写像と既知ノード判定は呼び出し側が注入する）。
 */
export function computeAuthorHeatmap(
  rows: readonly FileSessionCommitRow[],
  options: ComputeAuthorHeatmapOptions,
): AuthorHeatmapEntry[] {
  const { toNodeId, isKnownNode } = options;
  const byNode = new Map<string, NodeAccumulator>();

  for (const row of rows) {
    const sessionId = row.sessionId.trim();
    if (!sessionId) continue; // 帰属不明の行を最終編集者にしない
    const nodeId = toNodeId(row.filePath);
    if (isKnownNode && !isKnownNode(nodeId)) continue;

    let acc = byNode.get(nodeId);
    if (!acc) {
      acc = {
        commitsBySession: new Map(),
        allCommits: new Set(),
        lastEditedAt: '',
        lastCommitHash: '',
        lastSessionId: '',
      };
      byNode.set(nodeId, acc);
    }

    let commits = acc.commitsBySession.get(sessionId);
    if (!commits) {
      commits = new Set();
      acc.commitsBySession.set(sessionId, commits);
    }
    commits.add(row.commitHash);
    acc.allCommits.add(row.commitHash);

    const isFirst = acc.lastSessionId === '';
    if (isFirst || isNewerEdit(row.committedAt, row.commitHash, acc.lastEditedAt, acc.lastCommitHash)) {
      acc.lastEditedAt = row.committedAt;
      acc.lastCommitHash = row.commitHash;
      acc.lastSessionId = sessionId;
    }
  }

  const entries: AuthorHeatmapEntry[] = [];
  for (const [nodeId, acc] of byNode) {
    const perSession = [...acc.commitsBySession.values()].map((s) => s.size);
    const totalSessionCommits = perSession.reduce((sum, n) => sum + n, 0);
    if (totalSessionCommits === 0) continue;

    entries.push({
      nodeId,
      lastEditorSessionId: acc.lastSessionId,
      lastEditedAt: acc.lastEditedAt,
      commitCount: acc.allCommits.size,
      sessionCount: acc.commitsBySession.size,
      topSessionShare: Math.max(...perSession) / totalSessionCommits,
    });
  }

  // 属人度の高い順。UI が上位セッションを選ぶときの走査順にもなる。
  entries.sort(
    (a, b) =>
      b.topSessionShare - a.topSessionShare ||
      b.commitCount - a.commitCount ||
      a.nodeId.localeCompare(b.nodeId),
  );
  return entries;
}

/**
 * 固有色を割り当てる上位セッションを選ぶ。
 *
 * 最終編集セッションは実測 299 種あり、全部に色を与えると判別できない。
 * 担当ノード数の多い順に `limit` 件だけ残し、残りは UI 側で「その他」へまとめる。
 */
export function selectTopSessions(
  entries: readonly AuthorHeatmapEntry[],
  limit: number,
): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.lastEditorSessionId, (counts.get(e.lastEditorSessionId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([sessionId]) => sessionId);
}
