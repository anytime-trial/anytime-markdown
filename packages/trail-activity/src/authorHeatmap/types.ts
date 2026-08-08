/**
 * ファイル×セッション×コミットの生行（`activity_commit_files` JOIN `activity_session_commits` 由来）。
 *
 * 編集者の単位に git author を採らないのは、実測で 3 値（表記ゆれ 2 値 + エージェント 1 値）
 * しか存在せず着色が単色に潰れるため。要件も `session_id` / `agent_id` での代替を指定する。
 */
export type FileSessionCommitRow = {
  filePath: string;
  sessionId: string;
  commitHash: string;
  /** ISO 8601。未取込の行は空文字になり得る */
  committedAt: string;
};

/** コードグラフのノード 1 件分の編集集計。 */
export type AuthorHeatmapEntry = {
  /** コードグラフのノード ID（`<repo>:<拡張子を除いたパス>`） */
  nodeId: string;
  /** 最終編集セッション */
  lastEditorSessionId: string;
  /** 最終編集時刻（ISO 8601）。行が時刻を持たない場合は空文字 */
  lastEditedAt: string;
  /** 重複除去後のコミット数 */
  commitCount: number;
  /** 編集に関与したセッション数 */
  sessionCount: number;
  /** 最上位セッションのコミット比率（0-1・大きいほど属人化） */
  topSessionShare: number;
};

export type ComputeAuthorHeatmapOptions = {
  /**
   * ファイルパスをコードグラフのノード ID へ写す。
   * 呼び出し側が `toCodeGraphNodeId` を repo で束縛して渡す。
   */
  toNodeId: (filePath: string) => string;
  /** 集計対象に残すノード ID の判定（コードグラフに存在しないパスを落とす）。省略時は全件残す */
  isKnownNode?: (nodeId: string) => boolean;
};
