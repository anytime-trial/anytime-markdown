// handoff/types.ts — 圧縮ステート（handoff payload）の型。3 用途（セッション引き継ぎ /
// サブエージェント回転 / 毎タスク compact-seed）で共用する単一スキーマ。
//
// agent_sessions.summary 列に JSON 文字列として保存する。handoffVersion で将来の構造変更を
// 後方互換に読めるようにする（schema 進化時はここを上げる）。

/** transcript JSONL の 1 イベント（user / assistant / tool）。 */
export interface TranscriptEvent {
  readonly role: 'user' | 'assistant' | 'tool';
  readonly text: string;
  readonly tool: string;
  readonly detail: string;
  readonly files: readonly string[];
}

/** 決定論抽出した構造化状態（goal / 変更ファイル / コマンド / 直近状態 + git）。 */
export interface HandoffStructured {
  readonly goal: string;
  /** 直近 N 件に上限。全件数は filesTouchedTotal を参照。 */
  readonly filesTouched: readonly string[];
  readonly filesTouchedTotal: number;
  /** 直近 N 件に上限。全件数は commandsTotal を参照。 */
  readonly commands: readonly string[];
  readonly commandsTotal: number;
  readonly lastState: string;
  readonly branch: string;
  readonly lastCommit: string;
}

/** summary 列に保存する handoff payload 本体。 */
export interface HandoffState {
  readonly handoffVersion: number;
  readonly structured: HandoffStructured;
  /** 将来の LLM ナラティブ要約用。構造化状態のみの現段階では null。 */
  readonly narrative: string | null;
}

export const HANDOFF_VERSION = 1;
