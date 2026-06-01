// status/types.ts — agent-status の DB 行・API 契約の型定義
//
// SQLite を一切 import しない純粋な型のみ。ワーカー・クライアント・consumer 拡張が共有する。

/** read API のバージョン。内部スキーマ変更から consumer を保護する安定契約 */
export const AGENT_STATUS_API_VERSION = 1;

/** セッション内で編集されたファイルの記録 */
export interface AgentSessionEdit {
  readonly file: string;
  /** UTC ISO 8601 (例: "2026-04-16T11:28:59.778Z") */
  readonly timestamp: string;
}

/** 最新コミットの要約 */
export interface AgentLastCommit {
  readonly hash: string;
  /** UTC ISO 8601 */
  readonly timestamp: string;
}

/**
 * agent_sessions の 1 行。1 セッション 1 行の upsert テーブルに対応する。
 *
 * `summary` / `summaryAt` は本タスクでは列を予約するのみで書き込まない（要約生成は別タスク）。
 */
export interface AgentSessionRow {
  readonly sessionId: string;
  readonly editing: boolean;
  readonly file: string;
  readonly branch: string;
  readonly workspacePath: string;
  readonly sessionEdits: readonly AgentSessionEdit[];
  readonly plannedEdits: readonly string[];
  /** 直近 HEAD（コミット差分検出用）。未記録なら null */
  readonly lastHead: string | null;
  /** そのセッションのコミット累計 */
  readonly committedCount: number;
  /** 最新コミット。未コミットなら null */
  readonly lastCommit: AgentLastCommit | null;
  /** 予約列（本タスクでは未使用）。実施内容の要約 */
  readonly summary: string;
  /** 予約列（本タスクでは未使用）。要約生成時刻 UTC ISO 8601 */
  readonly summaryAt: string | null;
  /** 最終更新時刻 UTC ISO 8601 */
  readonly updatedAt: string;
}

/**
 * POST /api/agent-status/edit の body。
 *
 * 部分更新セマンティクス: `undefined` のフィールドは既存値を保持する。現行フックの「Edit/Write は
 * file + sessionEdits、Bash は workspacePath、plan は plannedEdits のみ更新」という選択マージを
 * 単一エンドポイントで再現する。commit 系・summary 系の列は一切触らない。
 */
export interface EditUpsertInput {
  readonly sessionId: string;
  /** 編集中フラグ。省略時は既存値を保持 */
  readonly editing?: boolean;
  /** 現在編集中のファイル。省略時は既存値を保持 */
  readonly file?: string;
  /** git ブランチ。省略時は既存値を保持 */
  readonly branch?: string;
  /** Bash ツールの cwd。省略時は既存値を保持 */
  readonly workspacePath?: string;
  /** session_edits に追記マージする 1 件（同 file は timestamp 更新、無ければ push） */
  readonly appendEdit?: AgentSessionEdit;
  /** planned_edits をまるごと置換する（plan hook 用）。省略時は既存値を保持 */
  readonly plannedEdits?: readonly string[];
  /** session_edits / planned_edits を空配列にする（clearEdits 用） */
  readonly clearEdits?: boolean;
  /** 更新時刻。省略時はワーカーが現在時刻を補う */
  readonly updatedAt?: string;
}

/** POST /api/agent-status/commit の body */
export interface CommitUpsertInput {
  readonly sessionId: string;
  /** 検出後の最新 HEAD。次回の差分検出基点として保存する */
  readonly lastHead: string;
  /** 最新コミットのハッシュ */
  readonly commitHash: string;
  /** 最新コミットの時刻 UTC ISO 8601 */
  readonly committedAt: string;
  /** 今回検出した新規コミット件数。committed_count に加算する */
  readonly count: number;
  /** 更新時刻。省略時はワーカーが現在時刻を補う */
  readonly updatedAt?: string;
}

/** GET レスポンスのエンベロープ（単一） */
export interface AgentStatusEnvelope {
  readonly version: number;
  readonly data: AgentSessionRow | null;
}

/** GET レスポンスのエンベロープ（全件） */
export interface AgentStatusListEnvelope {
  readonly version: number;
  readonly data: readonly AgentSessionRow[];
}

/** agent-worker.json の中身（接続情報） */
export interface AgentWorkerInfo {
  readonly schemaVersion: number;
  readonly pid: number;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  /** プロセス起動時刻 UTC ISO 8601 */
  readonly startedAt: string;
  readonly dbPath: string;
}
