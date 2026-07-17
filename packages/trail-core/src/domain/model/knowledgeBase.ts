// Phase 5 S3 (KB Persistence): グラフ系テーブルの破壊的書込を退避・監査するためのドメイン型。
// スナップショット実体は trail-db 側（FileBackupManager 流用）が実装する。

/** スナップショット発火元（破壊的書込経路のグルーピング） */
export type KnowledgeBaseWriteTrigger =
  | 'current_graphs'
  | 'current_code_graphs'
  | 'current_code_graph_communities'
  | 'release_graphs'
  | 'release_code_graphs';

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

/** Shrink Audit の警告ペイロード（onKbShrinkAlert コールバック / emergency_log detail_json） */
export interface KbShrinkAlert {
  table: 'current_graphs' | 'current_code_graphs' | 'current_code_graph_communities';
  repoName: string;
  before: number;
  after: number;
  /** (before - after) / before */
  lossRate: number;
}
