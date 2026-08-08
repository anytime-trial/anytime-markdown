// Phase 5 S3 (KB Persistence): グラフ系テーブルの破壊的書込を退避・監査するためのドメイン型。
// スナップショット実体は trail-db 側（FileBackupManager 流用）が実装する。

/** スナップショット発火元（破壊的書込経路のグルーピング） */
export type KnowledgeBaseWriteTrigger =
  | 'activity_current_graphs'
  | 'activity_current_code_graphs'
  | 'activity_current_code_graph_communities'
  | 'activity_release_graphs'
  | 'activity_release_code_graphs'
  // Snapshot per Commit。グラフ系テーブルへの破壊的書込（保持上限超過の削除を伴う）のため
  // 他のグラフ表と同じく Pre-write Snapshot の対象に入れる。
  | 'activity_commit_code_graphs';

export interface KnowledgeBaseSnapshotResult {
  /** 実際に世代ファイルを作成した場合 true（デバウンス skip / fail-open 時 false） */
  created: boolean;
  backupPath?: string;
}

export interface KnowledgeBaseSnapshotEntry {
  /** 世代番号（1 が最新） */
  generation: number;
  path: string;
  mtime: Date;
  compressedSize: number;
}

/** Shrink Audit の警告ペイロード（onKbShrinkAlert コールバック / activity_emergency_log detail_json） */
export interface KbShrinkAlert {
  table: 'activity_current_graphs' | 'activity_current_code_graphs' | 'activity_current_code_graph_communities';
  repoName: string;
  before: number;
  after: number;
  /** (before - after) / before */
  lossRate: number;
}
