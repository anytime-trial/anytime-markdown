// packages/editor-core/src/types/timeline.ts

/** タイムライン上の1コミットを表す */
export interface TimelineCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

/** プラットフォーム別のデータソース抽象 */
export interface TimelineDataProvider {
  /** コミット一覧を取得（新しい順） */
  getCommits(filePath: string): Promise<TimelineCommit[]>;
  /** 指定コミットのファイル内容を取得 */
  getFileContent(filePath: string, sha: string): Promise<string>;
}

/** タイムライン再生速度（秒） */
export type PlaybackSpeed = 1 | 2 | 5;

/** タイムラインの状態 */
export interface TimelineState {
  /** コミット一覧 */
  commits: TimelineCommit[];
  /** 現在選択中のコミットインデックス */
  selectedIndex: number;
  /** 選択中コミットのファイル内容 */
  content: string | null;
  /** 前コミットとの差分テキスト（差分ハイライト用） */
  previousContent: string | null;
  /** 再生中かどうか */
  isPlaying: boolean;
  /** 再生速度 */
  playbackSpeed: PlaybackSpeed;
  /** 読み込み中 */
  isLoading: boolean;
  /** エラーメッセージ */
  error: string | null;
}
