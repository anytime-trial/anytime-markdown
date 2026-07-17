import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import type { Database as BetterSqlite3Database } from 'better-sqlite3';

import { loadBetterSqlite3 } from './internal/loadBetterSqlite3';
import { SqlJsCompatDatabase } from './internal/SqlJsCompatDatabase';
import { SqlJsCompatStatement } from './internal/SqlJsCompatStatement';

// Backward compatibility: 既存 call site 互換のため、shim 型を旧名で再 export する。
type Database = SqlJsCompatDatabase;
type SqlJsStatement = SqlJsCompatStatement;
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AI_FIRST_TRY_FIX_WINDOW_MS,
  buildReleaseFromGitData,
  calculateCost,
  computeConfidenceCoupling,
  computeSessionConfidenceCoupling,
  computeSessionCoupling,
  computeSubagentTypeConfidenceCoupling,
  computeSubagentTypeCoupling,
  computeTemporalCoupling,
  CREATE_C4_MANUAL_ELEMENTS,
  CREATE_C4_MANUAL_GROUPS,
  CREATE_C4_MANUAL_INDEXES,
  CREATE_C4_MANUAL_RELATIONSHIPS,
  CREATE_CODE_DECISION_COMMENTS,
  CREATE_COMMIT_FILES,
  CREATE_CROSS_SOURCE_CORRELATIONS,
  CREATE_CROSS_SOURCE_CORRELATIONS_INDEXES,
  CREATE_CURRENT_CODE_GRAPH_COMMUNITIES,
  CREATE_CURRENT_CODE_GRAPHS,
  CREATE_CURRENT_COVERAGE,
  CREATE_CURRENT_COVERAGE_INDEXES,
  CREATE_CURRENT_FILE_ANALYSIS,
  CREATE_CURRENT_FUNCTION_ANALYSIS,
  CREATE_CURRENT_GRAPHS,
  CREATE_DAILY_COUNTS,
  CREATE_DORA_METRICS,
  CREATE_EMERGENCY_INDEXES,
  CREATE_EMERGENCY_LOG,
  CREATE_FILE_ANALYSIS_INDEXES,
  CREATE_FLIGHT_REVIEW_INDEXES,
  CREATE_FLIGHT_REVIEWS,
  CREATE_INDEXES,
  CREATE_USER_FEEDBACK_ENTRIES,
  CREATE_USER_FEEDBACK_INDEXES,
  CREATE_MESSAGE_COMMITS,
  CREATE_MESSAGE_TOOL_CALLS,
  CREATE_MESSAGE_TOOL_CALLS_INDEXES,
  CREATE_MESSAGES,
  CREATE_PR_REVIEW_COMMENTS,
  CREATE_PR_REVIEW_FINDINGS,
  CREATE_PR_REVIEW_FINDINGS_INDEXES,
  CREATE_PR_REVIEW_INDEXES,
  CREATE_PR_REVIEWS,
  CREATE_RELEASE_CODE_GRAPH_COMMUNITIES,
  CREATE_RELEASE_CODE_GRAPHS,
  CREATE_RELEASE_COVERAGE,
  CREATE_RELEASE_FILE_ANALYSIS,
  CREATE_RELEASE_FILES,
  CREATE_RELEASE_FUNCTION_ANALYSIS,
  CREATE_RELEASE_GRAPHS,
  CREATE_RELEASE_INDEXES,
  CREATE_RELEASES,
  CREATE_REPOS,
  CREATE_SAFE_POINTS,
  CREATE_SESSION_COMMIT_RESOLUTIONS,
  CREATE_SESSION_COMMITS,
  CREATE_SESSION_COSTS,
  CREATE_SESSIONS,
  CREATE_SKILL_MODELS as CREATE_SKILL_MODELS_TABLE,
  CREATE_SKILL_MODELS_RESOLVED_VIEW,
  DEFAULT_SKILL_MODELS,
  extractSkillName,
  isAiFirstTryFailureCommit,
  isCodeFile,
  resolvePricingModelName,
  trailToC4,
} from '@anytime-markdown/trail-core';
import { type C4ModelEntry, type C4ModelResult, type CommitFileRow, type CommitRiskRow, computeDefectRisk, type ConfidenceCouplingEdge, type CurrentCoverageRow, type DefectRiskEntry, type EmergencyEvent, type EmergencyEventInput, type FlightReview, type FlightReviewFilter, type FlightReviewMachineInput, type FlightReviewManualPatch, type RationaleAuditStatus, type IC4ModelStore,
  type LessonCandidate, type SelfAssessment, type UserFeedbackEntry, type UserFeedbackFilter, type UserFeedbackInput, type IKnowledgeBaseSnapshotter, type KbShrinkAlert, type KnowledgeBaseSnapshotEntry, type KnowledgeBaseWriteTrigger, type ManualElement, type ManualGroup, type ManualRelationship, matchCommitsToMessages, type MessageCommitInput, type PricingSource, type ReleaseCoverageRow, type ReleaseFileRow, type ReleaseRow, type SafePoint, type SafePointInput, type SessionFileRow, type SubagentTypeFileRow, type TemporalCouplingEdge, type TrailGraph, type TrailMessageCommit } from '@anytime-markdown/trail-core';
import type { AnalyzeOptions } from '@anytime-markdown/trail-core/analyze';
import ignore from 'ignore';

import { aggregateCommitPrefixBaseline, aggregateCommitPrefixStats, aggregateQualityRates, type CommitBaselineSummary } from './combinedDataAggregators';
import { getSqliteTzOffset,toUTC } from './dateUtils';
// daemon は analyze-child へ fork する非同期実装を注入するため、同期 (in-process
// `analyze`: CLI / テスト) と非同期 (child fork) の両方を許容する union とする。
// 呼び出し側 (analyzeReleases) は常に `await` するため両者を透過的に扱える。
export type AnalyzeFunction = (options: AnalyzeOptions) => TrailGraph | Promise<TrailGraph>;

/** saveDecisionComments の入力（analyze-child の DecisionComment と構造一致）。 */
export interface DecisionCommentInput {
  readonly filePath: string;
  readonly line: number;
  readonly text: string;
  readonly symbolName: string | null;
}

/** getDecisionComments の行（memory-core の ingestDecisionComments が消費）。 */
export interface DecisionCommentRow {
  readonly file_path: string;
  readonly line: number;
  readonly comment_text: string;
  readonly symbol_name: string | null;
  readonly commit_sha: string | null;
}

type DbScalar = string | number | null;

/**
 * importAll() を構成する論理 phase の識別子。
 * UI (OLLAMA panel pipelines) では各 phase が独立した entry として表示される。
 */
export type ImportAllPhase =
  | 'import_sessions'
  | 'resolve_releases'
  | 'analyze_releases'
  | 'import_coverage'
  | 'rebuild_costs'
  | 'analyze_behavior'
  | 'rebuild_counts'
  | 'backfill';

/**
 * importAll() が phase 境界で発火するイベント。
 * - 'start': phase 開始
 * - 'finish': phase 正常終了 (count に取り扱い件数)
 * - 'skip':   phase スキップ (該当データなし等)
 * - 'error':  phase 失敗 (message にエラー詳細)
 */
export interface ImportAllPhaseEvent {
  phase: ImportAllPhase;
  action: 'start' | 'finish' | 'skip' | 'error';
  count?: number;
  message?: string;
}

/**
 * LEP (Layered Event Pipeline) の Step 2b で追加された、importAll() へ LEP analyzer 側の
 * 結果を受け渡すための options bag。
 *
 * `phasesToSkip` に列挙された phase は importAll() 内では実行されず、対応する処理は
 * LEP analyzer (SessionImporter / ReleaseResolver / CoverageImporter 等) 側で実施する。
 * `externalCounters` は LEP analyzer が集計した件数を importAll() の戻り値にマージするための
 * バックチャネル。`externalSessionsToAnalyze` は SessionImporter が import に成功した session
 * 集合を Phase 6 (analyze_behavior) で再利用するためのもの。
 */
export interface ImportAllLepOptions {
  /** LEP 側で処理する phase 集合。importAll() 本体ではスキップする */
  phasesToSkip?: ReadonlySet<ImportAllPhase>;
  /** LEP 側で集計したセッション集合を Phase 6 で再利用 */
  externalSessionsToAnalyze?: ReadonlySet<string>;
  /** LEP 側で集計した import 件数 (戻り値マージ用) */
  externalCounters?: {
    imported?: number;
    skipped?: number;
    commitsResolved?: number;
    releasesResolved?: number;
    coverageImported?: number;
    currentCoverageImported?: number;
  };
}
import type { FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import { buildFeatureMatrixFromCommunities } from '@anytime-markdown/trail-core/c4';
import { type CodeGraph, composeCodeGraph, splitCodeGraph, type StoredCommunity } from '@anytime-markdown/trail-core/codeGraph';
import type { FileAnalysisRow, FunctionAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

import { ClaudeCodeBehaviorAnalyzer } from './ClaudeCodeBehaviorAnalyzer';
import { type DbLogger, noopDbLogger } from './DbLogger';
import { ExecFileGitService } from './ExecFileGitService';
import { JsonlSessionReader } from './JsonlSessionReader';
export type { ReleaseCoverageRow, ReleaseFileRow, ReleaseRow } from '@anytime-markdown/trail-core';

declare const __non_webpack_require__: (id: string) => unknown;

const DEFAULT_DB_DIR = path.join(process.cwd(), '.anytime', 'trail');

export { assertNotProductionWriteDuringTests } from './TrailDatabase.guard';
import { type NewCommunity,type OldCommunity, resolveCarryOver } from './communityCarryOver';
import { DatabaseIntegrityMonitor, type IntegrityAlert } from './DatabaseIntegrityMonitor';
import { FileKnowledgeBaseSnapshotter } from './KnowledgeBaseSnapshotter';
import { FileTrailStorage,ITrailStorage } from './ITrailStorage';
import { extractRepoNameFromJsonl } from './sessionMeta';
export type { IntegrityAlert } from './DatabaseIntegrityMonitor';
export { DatabaseIntegrityMonitor } from './DatabaseIntegrityMonitor';
export type { ITrailStorage } from './ITrailStorage';
export type { BackupEntry } from './ITrailStorage';
export { FileTrailStorage, InMemoryTrailStorage } from './ITrailStorage';

/**
 * 指定 community_id に属するノード ID の集合を CodeGraph.nodes から取り出す。
 * ジャッカード引き継ぎロジックの「新コミュニティ members」入力に使う。
 */
function collectMembersForCommunity(
  nodes: ReadonlyArray<{ id: string; community: number }>,
  communityId: number,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.community === communityId) out.add(n.id);
  }
  return out;
}

/**
 * テーブルに指定列が存在するか判定する。古いスキーマの DB（migration 未実行）への
 * 後方互換性を保つために使う。
 */
function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? [];
  return cols.some((c) => String(c[1]) === column);
}

// Phase B-2b-iii flip: release 子テーブル名 → 新スキーマ DDL の対応表。
// migrateReleasesFlip の 12-step 再構築で `<table>__new` を作る際に使う。
const RELEASE_CHILD_DDL: Readonly<Record<string, string>> = {
  release_graphs: CREATE_RELEASE_GRAPHS,
  release_files: CREATE_RELEASE_FILES,
  release_coverage: CREATE_RELEASE_COVERAGE,
  release_code_graphs: CREATE_RELEASE_CODE_GRAPHS,
  release_code_graph_communities: CREATE_RELEASE_CODE_GRAPH_COMMUNITIES,
  release_file_analysis: CREATE_RELEASE_FILE_ANALYSIS,
  release_function_analysis: CREATE_RELEASE_FUNCTION_ANALYSIS,
};

// Phase C-2 flip: current_* テーブル名 → 新スキーマ (repo_id PK) DDL の対応表。
// migrateCurrentTablesRepoId の 12-step 再構築で `<table>__new` を作る際に使う。
const CURRENT_REPO_ID_DDL: Readonly<Record<string, string>> = {
  current_graphs: CREATE_CURRENT_GRAPHS,
  current_code_graphs: CREATE_CURRENT_CODE_GRAPHS,
  current_code_graph_communities: CREATE_CURRENT_CODE_GRAPH_COMMUNITIES,
  current_coverage: CREATE_CURRENT_COVERAGE,
  current_file_analysis: CREATE_CURRENT_FILE_ANALYSIS,
  current_function_analysis: CREATE_CURRENT_FUNCTION_ANALYSIS,
};

// Phase D flip: session/commit 系テーブル名 → 新スキーマ (repo_id 化) DDL の対応表。
// migrateSessionCommitTablesRepoId の 12-step 再構築で `<table>__new` を作る際に使う。
// session_commits / commit_files / session_commit_resolutions は PK が repo_id を含むよう
// 再設計される (PK widening)。sessions は PK 不変 (additive) のためここには含めない。
const SESSION_COMMIT_REPO_ID_DDL: Readonly<Record<string, string>> = {
  session_commits: CREATE_SESSION_COMMITS,
  commit_files: CREATE_COMMIT_FILES,
  session_commit_resolutions: CREATE_SESSION_COMMIT_RESOLUTIONS,
};

// Phase E flip: c4_manual_* テーブル名 → 新スキーマ (repo_id PK + 複合 FK) DDL の対応表。
// migrateC4ManualTablesRepoId の 12-step 再構築で `<table>__new` を作る際に使う。
// 親 (c4_manual_elements) を先に再構築する必要があるため、配列順序が重要 (DDL map は順不同だが
// rebuild は C4_MANUAL_REPO_ID_TABLES の順で回す)。
const C4_MANUAL_REPO_ID_DDL: Readonly<Record<string, string>> = {
  c4_manual_elements: CREATE_C4_MANUAL_ELEMENTS,
  c4_manual_relationships: CREATE_C4_MANUAL_RELATIONSHIPS,
  c4_manual_groups: CREATE_C4_MANUAL_GROUPS,
};

// Phase F flip: derived テーブル名 → 新スキーマ (repo_id 化) DDL の対応表。
// migrateDerivedTablesRepoId で使う。dora_metrics は PK 変更 (12-step 再構築) のため DDL を引く。
// pr_reviews / cross_source_correlations は PK 不変 (additive) のためここには含めない。
const DERIVED_REPO_ID_DDL: Readonly<Record<string, string>> = {
  dora_metrics: CREATE_DORA_METRICS,
};

// Phase H-1: derived テーブル名 → 新スキーマ (repo_name 列を撤去した) DDL の対応表。
// migrateDropDerivedRepoName が repo_name 物理撤去の 12-step 再構築で引く。
// repo_name が必要な read は JOIN repos USING(repo_id) で復元する (下流契約は不変)。
const DERIVED_DROP_REPO_NAME_DDL: Readonly<Record<string, string>> = {
  dora_metrics: CREATE_DORA_METRICS,
  pr_reviews: CREATE_PR_REVIEWS,
  cross_source_correlations: CREATE_CROSS_SOURCE_CORRELATIONS,
};

// Phase H-2: c4_manual 系テーブル名 → 新スキーマ (repo_name 列を撤去した) DDL の対応表。
// migrateDropC4ManualRepoName が repo_name 物理撤去の 12-step 再構築で引く。複合 PK (repo_id, <id>)・
// 複合 FK (repo_id, parent_id/from_id/to_id) は repo_id 構成のため repo_name 撤去後も不変。
// repo フィルタは repo_id = ? (repoIdForName 解決) で行う (read の WHERE は repo_id = ?)。
const C4_MANUAL_DROP_REPO_NAME_DDL: Readonly<Record<string, string>> = {
  c4_manual_elements: CREATE_C4_MANUAL_ELEMENTS,
  c4_manual_relationships: CREATE_C4_MANUAL_RELATIONSHIPS,
  c4_manual_groups: CREATE_C4_MANUAL_GROUPS,
};

// Phase H-3: current 系テーブル名 → 新スキーマ (repo_name 列を撤去した) DDL の対応表。
// migrateDropCurrentRepoName が repo_name 物理撤去の 12-step 再構築で引く。
// PK / FK / CHECK / STRICT は repo_id 構成のため不変。current_code_graph_communities の stable_key 列
// (+ 部分索引 idx_ccgc_stable_key) は引き継ぎ用途のため新 DDL でも維持する。新 DDL に無い ALTER 由来の
// 列 (mappings_json) は再構築時に旧テーブルから引き継ぐ (rebuildCurrentTableDroppingRepoName 参照)。
// repo_name が必要な read は JOIN repos USING(repo_id) で復元する (下流契約は不変)。
const CURRENT_DROP_REPO_NAME_DDL: Readonly<Record<string, string>> = {
  current_graphs: CREATE_CURRENT_GRAPHS,
  current_code_graphs: CREATE_CURRENT_CODE_GRAPHS,
  current_code_graph_communities: CREATE_CURRENT_CODE_GRAPH_COMMUNITIES,
  current_coverage: CREATE_CURRENT_COVERAGE,
  current_file_analysis: CREATE_CURRENT_FILE_ANALYSIS,
  current_function_analysis: CREATE_CURRENT_FUNCTION_ANALYSIS,
};

// Phase H-4: session/commit 系テーブル名 → 新スキーマ (repo_name 列を撤去した) DDL の対応表。
// migrateDropSessionCommitRepoName が repo_name 物理撤去の 12-step 再構築で引く。
// 複合 PK (session_id, repo_id, commit_hash) / (repo_id, commit_hash, file_path) / (session_id, repo_id) ・
// FK は repo_id 構成のため repo_name 撤去後も不変。sessions は PK が id・repo_id additive。新 DDL に無い
// ALTER 由来の列 (sessions の peak_context_tokens など多数) は再構築時に旧テーブルから引き継ぐ
// (rebuildSessionCommitTableDroppingRepoName 参照)。repo_name が必要な read (SyncService の Supabase
// ミラー含む) は (LEFT) JOIN repos USING(repo_id) で復元する (下流契約は不変)。
const SESSION_COMMIT_DROP_REPO_NAME_DDL: Readonly<Record<string, string>> = {
  sessions: CREATE_SESSIONS,
  session_commits: CREATE_SESSION_COMMITS,
  commit_files: CREATE_COMMIT_FILES,
  session_commit_resolutions: CREATE_SESSION_COMMIT_RESOLUTIONS,
};

// Phase H-5: releases サブツリーのテーブル名 → 新スキーマ (repo_name 列を撤去した) DDL の対応表。
// migrateDropReleaseSubtreeRepoName が repo_name 物理撤去の 12-step 再構築で引く。
// - releases: PK は release_id 単独 (repo_name は非 PK) のため、撤去後も PK 不変。
// - release_file_analysis: PK (release_id, repo_name, file_path) → (release_id, file_path) へ張替。
// - release_function_analysis: PK (release_id, repo_name, file_path, function_name, start_line) →
//   (release_id, file_path, function_name, start_line) へ張替。
// release_id が (repo, tag) を一意に決めるため repo_name は冗長で、PK から除いても重複は生じない。
// repo_name が必要な read (SyncService の Supabase trail_releases / trail_release_*_analysis ミラー含む)
// は releases→repos JOIN で repo_name を、release 行は release_id→releases.tag を射影する (下流契約は不変)。
const RELEASE_SUBTREE_DROP_REPO_NAME_DDL: Readonly<Record<string, string>> = {
  releases: CREATE_RELEASES,
  release_file_analysis: CREATE_RELEASE_FILE_ANALYSIS,
  release_function_analysis: CREATE_RELEASE_FUNCTION_ANALYSIS,
};

/**
 * `*_code_graph_communities` テーブルに `stable_key` 列が無ければ ALTER で追加する。
 * 起動時マイグレーションのため、`saveCurrentCodeGraph` / `saveReleaseCodeGraph` / `upsert*` の
 * 各書き込みパスの冒頭で 1 度だけ実行する想定。`IF NOT EXISTS` セマンティクスを columnExists で代用。
 */
function ensureCommunityStableKeyColumn(
  db: Database,
  table: 'current_code_graph_communities' | 'release_code_graph_communities',
): void {
  if (!columnExists(db, table, 'stable_key')) {
    db.run(`ALTER TABLE ${table} ADD COLUMN stable_key TEXT NOT NULL DEFAULT ''`);
  }
}

/**
 * `current_code_graph_communities` に `mappings_json` 列が無ければ ALTER で追加する。
 * 当初のスキーマには無く、AI 後処理スキル（anytime-reverse-engineer）の導入時に動的追加した経緯あり。
 * saveCurrentCodeGraph 等の書き込みパスで INSERT 文に mappings_json を含める前に呼ぶ。
 */
function ensureCommunityMappingsJsonColumn(db: Database, table: 'current_code_graph_communities'): void {
  if (!columnExists(db, table, 'mappings_json')) {
    db.run(`ALTER TABLE ${table} ADD COLUMN mappings_json TEXT`);
  }
}

const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'last-prompt',
  'queue-operation',
]);

const TEMPORAL_COUPLING_EXCLUDE_PATTERNS: readonly RegExp[] = [
  /\.lock$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /\.min\.js$/,
  /\.map$/,
  /(^|\/)\.worktrees\//,
  /(^|\/)\.claude\//, // .claude/settings.json 等は CodeGraph 対象外
  /(^|\/)\.vscode\//, // .vscode/graphify-out/*.json 等の生成物は CodeGraph 対象外
  /(^|\/)\.next\//,
  /(^|\/)out\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
];

export function defaultTemporalCouplingPathFilter(filePath: string): boolean {
  return !TEMPORAL_COUPLING_EXCLUDE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * サブエージェントが `.claude/worktrees/agent-XXXX/` 内で編集したファイルパスから
 * worktree プレフィックスを剥がし、リポルート起点の相対パスに正規化する。
 * 例: `.claude/worktrees/agent-a30eb6d2/packages/foo/bar.ts` → `packages/foo/bar.ts`
 * これをやらないと `Workspace:packages/foo/bar` のような CodeGraph node ID と一致せず描画されない。
 */
export function stripWorktreePrefix(relPath: string): string {
  return relPath.replace(/^\.claude\/worktrees\/[^/]+\//, '');
}

/**
 * SQL 行から読み出した値 (sql.js の `unknown` / `SqlValue` 相当) を安全に文字列化する。
 *
 * `String(v ?? '')` は `v` が `Uint8Array` (BLOB) や object のとき
 * `[object Object]` 等の既定文字列化になりうる (SonarCloud S6551)。本ヘルパーは
 * 型を絞り込んでから変換するため S6551 を発火させず、TEXT 列の想定外 BLOB も
 * `TextDecoder` で実テキストに復元する。
 *
 * - `null` / `undefined` → `''`
 * - `string` → そのまま
 * - `number` / `bigint` / `boolean` → `String(v)` (object でないため S6551 対象外)
 * - `Uint8Array` (BLOB) → UTF-8 デコード
 * - その他 object → JSON 文字列 (最終フォールバック)
 */
function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  return JSON.stringify(v);
}

/**
 * SQL から読み出した category 値を FileAnalysisRow.category 型へ正規化する。
 * 想定外の値は 'logic' にフォールバックする。
 */
function parseCategory(v: unknown): 'ui' | 'logic' | 'excluded' {
  const s = asText(v ?? 'logic');
  if (s === 'ui' || s === 'logic' || s === 'excluded') return s;
  return 'logic';
}

export type TemporalCouplingGranularity = 'commit' | 'session' | 'subagentType';
export type ActivityTrendGranularity = 'commit' | 'session' | 'subagent' | 'defect';

/** session 粒度で「ファイル編集」とみなすツール名。 */
export const SESSION_COUPLING_EDIT_TOOLS: readonly string[] = [
  'Edit',
  'Write',
  'NotebookEdit',
];
const ACTIVITY_TREND_READ_TOOLS: readonly string[] = [
  'Read',
  'NotebookRead',
];

/** subagent 粒度集計で codex 委任セッションを表すラベル。 */
export const CODEX_SUBAGENT_TYPE = 'codex';

export type FetchTemporalCouplingOptions = {
  repoName: string;
  windowDays: number;
  minChangeCount?: number;
  jaccardThreshold?: number;
  topK?: number;
  directional?: boolean;
  confidenceThreshold?: number;
  directionalDiffThreshold?: number;
  /** 'commit'（デフォルト）= commit_files 起点、'session' = message_tool_calls 起点。 */
  granularity?: TemporalCouplingGranularity;
};

export type FetchDefectRiskOptions = {
  windowDays: number;
  halfLifeDays: number;
};

// ---------------------------------------------------------------------------
//  Type definitions
// ---------------------------------------------------------------------------

interface CoverageSummaryEntry {
  lines: { total: number; covered: number; skipped: number; pct: number };
  statements: { total: number; covered: number; skipped: number; pct: number };
  functions: { total: number; covered: number; skipped: number; pct: number };
  branches: { total: number; covered: number; skipped: number; pct: number };
}

export interface SessionRow {
  readonly id: string;
  readonly slug: string;
  readonly repo_name: string;
  // Supabase 正規化ミラー用 (additive)。拡張ローカル UI は repo_name を使う。
  readonly repo_id?: number | null;
  readonly git_branch?: string | null;
  readonly cwd?: string | null;
  readonly permission_mode?: string | null;
  readonly version: string;
  readonly entrypoint: string;
  readonly model: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly message_count: number;
  readonly file_path: string;
  readonly file_size: number;
  readonly imported_at: string;
  readonly commits_resolved_at?: string;
  // Aggregated from session_costs via JOIN
  readonly estimated_cost_usd?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_tokens?: number;
  readonly cache_creation_tokens?: number;
  readonly peak_context_tokens?: number;
  readonly initial_context_tokens?: number;
  readonly interruption_reason?: string | null;
  readonly interruption_context_tokens?: number;
  readonly compact_count?: number;
  readonly sub_agent_count?: number | null;
  readonly error_count?: number | null;
  readonly assistant_message_count?: number | null;
  readonly source?: string;
}

export interface MessageRow {
  readonly uuid: string;
  readonly session_id: string;
  readonly parent_uuid: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly text_content: string | null;
  readonly user_content: string | null;
  readonly tool_calls: string | null;
  readonly tool_use_result: string | null;
  readonly model: string | null;
  readonly request_id: string | null;
  readonly stop_reason: string | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly service_tier: string | null;
  readonly speed: string | null;
  readonly timestamp: string;
  readonly is_sidechain: number;
  readonly is_meta: number;
  readonly cwd: string | null;
  readonly git_branch: string | null;
  readonly permission_mode?: string | null;
  readonly skill?: string | null;
  readonly agent_id?: string | null;
  readonly agent_description?: string | null;
  readonly agent_model?: string | null;
  readonly subagent_type?: string | null;
  readonly source_tool_assistant_uuid?: string | null;
  readonly source_tool_use_id?: string | null;
  readonly system_command?: string | null;
  readonly duration_ms?: number | null;
  readonly tool_result_size?: number | null;
}

export interface SessionCommitRow {
  readonly session_id: string;
  readonly commit_hash: string;
  readonly commit_message: string;
  readonly author: string;
  readonly committed_at: string;
  readonly is_ai_assisted: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly repo_name: string;
  // Supabase 正規化ミラー用 (additive)。getSessionCommits が sc.repo_id を投影する。
  readonly repo_id?: number;
}

interface SessionFilters {
  readonly branch?: string;
  readonly model?: string;
  readonly repository?: string;
  readonly from?: string;
  readonly to?: string;
}

interface SearchResult {
  readonly session_id: string;
  readonly uuid: string;
  readonly snippet: string;
  readonly type: string;
  readonly timestamp: string;
}

interface DbStats {
  readonly totalSessions: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly topToolNames: readonly { name: string; count: number }[];
  readonly sessionsByBranch: readonly { branch: string; count: number }[];
  readonly sessionsByModel: readonly { model: string; count: number }[];
}

export interface AnalyticsData {
  readonly totals: {
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly estimatedCostUsd: number;
    readonly totalCommits: number;
    readonly totalLinesAdded: number;
    readonly totalLinesDeleted: number;
    readonly totalFilesChanged: number;
    readonly totalAiAssistedCommits: number;
    readonly totalSessionDurationMs: number;
    readonly totalRetries: number;
    readonly totalEdits: number;
    readonly totalBuildRuns: number;
    readonly totalBuildFails: number;
    readonly totalTestRuns: number;
    readonly totalTestFails: number;
    readonly totalLoc: number;
  };
  readonly toolUsage: readonly { name: string; count: number }[];
  readonly dailyActivity: readonly {
    readonly date: string;
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
    readonly estimatedCostUsd: number;
  }[];
}

export interface CostOptimizationData {
  readonly actual: { readonly totalCost: number; readonly byModel: Readonly<Record<string, number>> };
  readonly skillEstimate: { readonly totalCost: number; readonly byModel: Readonly<Record<string, number>> };
  readonly daily: readonly {
    readonly date: string;
    readonly actualCost: number;
    readonly skillCost: number;
  }[];
  readonly modelDistribution: {
    readonly actual: Readonly<Record<string, number>>;
    readonly skillRecommended: Readonly<Record<string, number>>;
  };
}

interface CombinedData {
  readonly toolCounts: readonly { period: string; tool: string; count: number; tokens: number; durationMs: number; tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number }[];
  readonly errorRate: readonly { period: string; rate: number; byTool: Readonly<Record<string, number>> }[];
  readonly skillStats: readonly { period: string; skill: string; count: number; costUsd: number }[];
  readonly modelStats: readonly { period: string; model: string; count: number; tokens: number; tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number }[];
  readonly agentStats: readonly {
    period: string; agent: string; tokens: number; costUsd: number; loc: number;
    tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number;
  }[];
  readonly commitPrefixStats: readonly { period: string; prefix: string; count: number; linesAdded: number; linesDeleted: number }[];
  readonly aiFirstTryRate: readonly { period: string; rate: number; sampleSize: number }[];
  readonly repoStats: readonly { period: string; repoName: string; count: number; tokens: number }[];
  readonly qualityRates: readonly { period: string; retryRate: number | null; buildFailRate: number | null; testFailRate: number | null }[];
  readonly commitBaseline?: CommitBaselineSummary;
  readonly commitRegressionByPeriod?: readonly { period: string; count: number }[];
}

const COMMIT_REGRESSION_FIX_RE = /^fix\([^)]*regression[^)]*\)/i;

interface RawLine {
  uuid?: string;
  parentUuid?: string | null;
  type?: string;
  subtype?: string;
  timestamp?: string;
  sessionId?: string;
  version?: string;
  gitBranch?: string;
  cwd?: string;
  slug?: string;
  entrypoint?: string;
  userType?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  permissionMode?: string;
  promptId?: string;
  requestId?: string;
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  sourceToolUseID?: string;
  agentId?: string;
  durationMs?: number;
  message?: {
    role?: string;
    model?: string;
    content?: string | readonly RawContentBlock[];
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      service_tier?: string;
      speed?: string;
    };
  };
  payload?: Record<string, unknown>;
  call_id?: string;
}

interface RawContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
//  SQL statements
// ---------------------------------------------------------------------------

// Schema constants imported from trail-core (see import at top of file)









// DEFAULT_SKILL_MODELS imported from trail-core (see import at top of file)

// CREATE_INDEXES imported from trail-core (see import at top of file)

const INSERT_SESSION = `INSERT OR REPLACE INTO sessions
  (id, slug, repo_id, version, entrypoint, model,
   start_time, end_time, message_count,
   file_path, file_size, imported_at, source)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const INSERT_SESSION_COST = `INSERT OR REPLACE INTO session_costs
  (session_id, model, input_tokens, output_tokens,
   cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
  VALUES (?,?,?,?,?,?,?)`;


export const INSERT_MESSAGE = `INSERT OR REPLACE INTO messages
  (uuid, session_id, parent_uuid, type, subtype, text_content,
   user_content, tool_calls, tool_use_result, model, request_id,
   stop_reason, input_tokens, output_tokens, cache_read_tokens,
   cache_creation_tokens, service_tier, speed, timestamp,
   is_sidechain, is_meta, cwd, git_branch,
   duration_ms, tool_result_size, agent_description, agent_model,
   permission_mode, skill, agent_id, source_tool_assistant_uuid, source_tool_use_id, system_command, subagent_type)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;


// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function extractTextContent(
  content: string | readonly RawContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts = (content as RawContentBlock[])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string);
  return texts.length > 0 ? texts.join('\n') : null;
}

function extractToolCalls(
  content: string | readonly RawContentBlock[] | undefined,
): string | null {
  if (typeof content === 'string' || !Array.isArray(content)) return null;
  const calls = (content as RawContentBlock[])
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ id: b.id ?? '', name: b.name ?? '', input: b.input ?? {} }));
  return calls.length > 0 ? JSON.stringify(calls) : null;
}

function extractCodexText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const text = (block as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim()) texts.push(text);
  }
  return texts.length > 0 ? texts.join('\n') : null;
}

function normalizeCodexTokenUsage(last: Record<string, unknown>): {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
} {
  const totalInputTokens = Number(last.input_tokens ?? 0);
  const cachedInputTokens = Number(last.cached_input_tokens ?? 0);
  return {
    input_tokens: Math.max(0, totalInputTokens - cachedInputTokens),
    output_tokens: Number(last.output_tokens ?? 0),
    cache_read_input_tokens: cachedInputTokens,
    cache_creation_input_tokens: 0,
  };
}

function collectJsonlFilesRecursive(rootDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    let entries: string[] = [];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  }
  walk(rootDir);
  return results;
}

function applyCodexTokenCountToNormalized(
  payload: Record<string, unknown>,
  normalized: RawLine[],
): void {
  if (!payload.info || typeof payload.info !== 'object') return;
  const info = payload.info as Record<string, unknown>;
  const last = info.last_token_usage as Record<string, unknown> | undefined;
  if (!last || normalized.length === 0) return;
  for (let i = normalized.length - 1; i >= 0; i--) {
    const candidate = normalized[i];
    if (candidate.type !== 'assistant') continue;
    candidate.message = {
      ...(candidate.message),
      usage: normalizeCodexTokenUsage(last),
    };
    break;
  }
}

function normalizeCodexEventMsg(
  payload: Record<string, unknown>,
  normalized: RawLine[],
  seq: number,
  sessionId: string,
  timestamp: string,
): { lines: RawLine[]; newSeq: number } {
  if (payload.type === 'task_started') return { lines: [], newSeq: seq };
  if (payload.type === 'token_count') {
    applyCodexTokenCountToNormalized(payload, normalized);
    return { lines: [], newSeq: seq };
  }
  if (payload.type === 'agent_message' && typeof payload.message === 'string') {
    return {
      lines: [{
        uuid: `codex-${seq}`,
        sessionId,
        type: 'assistant',
        timestamp,
        message: { content: payload.message },
      }],
      newSeq: seq + 1,
    };
  }
  return { lines: [], newSeq: seq };
}

function normalizeCodexResponseItem(
  payload: Record<string, unknown>,
  payloadType: string,
  sessionId: string,
  timestamp: string,
  seq: number,
  normalized: RawLine[],
): { lines: RawLine[]; newSeq: number } {
  if (payloadType === 'message') {
    const role = typeof payload.role === 'string' ? payload.role : '';
    if (role !== 'user' && role !== 'assistant' && role !== 'developer' && role !== 'system') {
      return { lines: [], newSeq: seq };
    }
    const text = extractCodexText(payload.content);
    const normalizedTypeInner: 'assistant' | 'system' = role === 'assistant' ? 'assistant' : 'system';
    const normalizedType: 'user' | 'assistant' | 'system' = role === 'user' ? 'user' : normalizedTypeInner;
    return {
      lines: [{
        uuid: `codex-${seq}`,
        sessionId,
        type: normalizedType,
        subtype: role,
        timestamp,
        message: { content: text ?? '' },
      }],
      newSeq: seq + 1,
    };
  }
  if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
    const id = typeof payload.call_id === 'string' ? payload.call_id : `codex-call-${seq}`;
    const name = typeof payload.name === 'string' ? payload.name : 'tool';
    const rawInput = payloadType === 'function_call' ? payload.arguments : payload.input;
    let parsedInput: Record<string, unknown> = {};
    if (typeof rawInput === 'string' && rawInput.trim()) {
      try { parsedInput = JSON.parse(rawInput) as Record<string, unknown>; } catch { parsedInput = { raw: rawInput }; }
    } else if (rawInput && typeof rawInput === 'object') {
      parsedInput = rawInput as Record<string, unknown>;
    }
    return {
      lines: [{
        uuid: `codex-${seq}`,
        sessionId,
        type: 'assistant',
        timestamp,
        message: { content: [{ type: 'tool_use', id, name, input: parsedInput }] },
      }],
      newSeq: seq + 1,
    };
  }
  if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
    const id = typeof payload.call_id === 'string' ? payload.call_id : '';
    const output = typeof payload.output === 'string'
      ? payload.output
      : JSON.stringify(payload.output ?? '');
    return {
      lines: [{
        uuid: `codex-${seq}`,
        sessionId,
        type: 'user',
        timestamp,
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: id,
            content: output,
            is_error: false,
          }] as unknown as readonly RawContentBlock[],
        },
      }],
      newSeq: seq + 1,
    };
  }
  if (payloadType === 'token_count') {
    applyCodexTokenCountToNormalized(payload, normalized);
  }
  return { lines: [], newSeq: seq };
}

function normalizeCodexRecords(records: readonly RawLine[], fallbackSessionId: string): {
  normalized: RawLine[];
  sessionId: string;
  version: string;
  source: 'codex';
} {
  const normalized: RawLine[] = [];
  let seq = 0;
  let sessionId = fallbackSessionId;
  let version = '';

  for (const record of records) {
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';
    if (record.type === 'session_meta' && record.payload && typeof record.payload === 'object') {
      const payload = record.payload;
      const id = payload.id;
      if (typeof id === 'string' && id) sessionId = id;
      const cliVersion = payload.cli_version;
      if (typeof cliVersion === 'string' && cliVersion) version = cliVersion;
      continue;
    }
    if (record.type === 'event_msg' && record.payload && typeof record.payload === 'object') {
      const { lines, newSeq } = normalizeCodexEventMsg(record.payload, normalized, seq, sessionId, timestamp);
      normalized.push(...lines);
      seq = newSeq;
      continue;
    }
    if (record.type !== 'response_item' || !record.payload || typeof record.payload !== 'object') continue;
    const payload = record.payload;
    const payloadType = typeof payload.type === 'string' ? payload.type : '';
    const { lines, newSeq } = normalizeCodexResponseItem(payload, payloadType, sessionId, timestamp, seq, normalized);
    normalized.push(...lines);
    seq = newSeq;
  }
  return { normalized, sessionId, version, source: 'codex' };
}

/**
 * Extract Agent tool call description and model from tool_calls JSON.
 * Returns the first Agent call found (most messages have at most one).
 */
function extractAgentInfo(
  toolCallsJson: string | null,
): { description: string | null; model: string | null; subagentType: string | null } {
  if (!toolCallsJson) return { description: null, model: null, subagentType: null };
  try {
    const calls = JSON.parse(toolCallsJson) as { name?: string; input?: Record<string, unknown> }[];
    const agentCall = calls.find((c) => c.name === 'Agent');
    if (!agentCall?.input) return { description: null, model: null, subagentType: null };
    return {
      description: (agentCall.input.description as string) ?? null,
      model: (agentCall.input.model as string) ?? null,
      subagentType: (agentCall.input.subagent_type as string) ?? null,
    };
  } catch {
    return { description: null, model: null, subagentType: null };
  }
}

/**
 * サブエージェント JSONL に隣接する `agent-{agentId}.meta.json` から `agentType` を読む。
 * April 2026 以降に Claude Code が記録する。古いセッションでは存在せず NULL を返す。
 */
function readSubagentTypeFromMeta(jsonlPath: string): string | null {
  const metaPath = jsonlPath.replace(/\.jsonl$/, '.meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const meta = JSON.parse(raw) as { agentType?: unknown };
    return typeof meta.agentType === 'string' && meta.agentType.length > 0 ? meta.agentType : null;
  } catch {
    return null;
  }
}

// extractSkillName imported from trail-core (see import at top of file)

/**
 * Estimate token count from a string.
 * Uses a rough heuristic of 1 token per 4 characters.
 */
function estimateTokenCount(text: string | null): number | null {
  if (!text) return null;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
//  Cost classification helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  DORA metrics (LEP Layer 4 / Step 4a)
// ---------------------------------------------------------------------------

/** {@link TrailDatabase.getDoraReleases} の戻り値。DORA 集計の入力 release 行。 */
export interface DoraReleaseInput {
  /** release tag */
  readonly tag: string;
  /** リリース日時 (ISO 8601 + Z)。NULL / 空文字の release は除外済み */
  readonly releasedAt: string;
  /** リポジトリ名 */
  readonly repoName: string;
}

/** {@link TrailDatabase.getDoraCommits} の戻り値。lead time 算出の入力 commit 行。 */
export interface DoraCommitInput {
  /** commit hash */
  readonly commitHash: string;
  /** コミット日時 (ISO 8601 + Z)。NULL / 空文字の commit は除外済み */
  readonly committedAt: string;
  /** リポジトリ名 */
  readonly repoName: string;
}

/** {@link TrailDatabase.replaceDoraMetrics} に渡す dora_metrics 1 行。 */
export interface DoraMetricRow {
  readonly repoName: string;
  /** 集計期間 'YYYY-MM' */
  readonly period: string;
  /** 期間内の deployment 件数 (release 数) */
  readonly deploymentFrequency: number;
  /** commit → 含有 release の中央値 (時間)。算出不能なら null */
  readonly leadTimeHours: number | null;
  /** 算出日時 (ISO 8601 + Z) */
  readonly computedAt: string;
}

// ---------------------------------------------------------------------------
//  GitHub PR review (LEP 新ソース / Step 4b-4c)
// ---------------------------------------------------------------------------

/** PR review の行コメント (取込入力)。 */
export interface PrReviewCommentInput {
  readonly path: string;
  readonly line: number | null;
  readonly body: string;
}

/** {@link TrailDatabase.upsertPrReview} に渡す PR review 1 件。 */
export interface PrReviewUpsert {
  readonly reviewId: string;
  readonly repoName: string;
  readonly prNumber: number;
  readonly author: string;
  readonly state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  readonly submittedAt: string;
  readonly body: string;
  readonly bodyHash: string;
  readonly comments: readonly PrReviewCommentInput[];
}

/** {@link TrailDatabase.getPrReviews} の戻り値 (CrossSourceCorrelator 入力)。 */
export interface PrReviewRow {
  readonly reviewId: string;
  readonly repoName: string;
  readonly prNumber: number;
  readonly author: string;
  readonly state: string;
  readonly submittedAt: string;
  readonly bodyHash: string;
}

/** {@link TrailDatabase.getPrReviewDetail} の戻り値 (finding 抽出入力)。 */
export interface PrReviewDetail {
  readonly reviewId: string;
  readonly repoName: string;
  readonly prNumber: number;
  readonly state: string;
  readonly body: string;
  readonly comments: readonly PrReviewCommentInput[];
}

/** pr_review_findings の 1 行 ({@link TrailDatabase.replacePrReviewFindings} / getter 共通)。 */
export interface PrReviewFindingRow {
  readonly findingId: string;
  readonly reviewId: string;
  readonly filePath: string;
  readonly lineNumber: number | null;
  readonly severity: 'error' | 'warn' | 'info' | null;
  readonly category: string | null;
  readonly body: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
//  Cross-source correlation (LEP Layer 4 / Step 4d)
// ---------------------------------------------------------------------------

/** {@link TrailDatabase.getCorrelationSessionCommits} の戻り値。 */
export interface CorrelationSessionCommit {
  readonly sessionId: string;
  readonly commitHash: string;
  readonly committedAt: string;
  readonly repoName: string;
}

/** {@link TrailDatabase.getCorrelationCommitFiles} の戻り値。 */
export interface CorrelationCommitFile {
  readonly commitHash: string;
  readonly filePath: string;
  readonly repoName: string;
}

/** cross-source 相関の左辺ソース種別 (pr_reviews / pr_review_findings 由来)。 */
export type CrossSourceAKind = 'pr_review' | 'pr_finding';
/** cross-source 相関の右辺ソース種別 (session / release / commit)。 */
export type CrossSourceBKind = 'session' | 'release' | 'commit';

/** {@link TrailDatabase.replaceCrossSourceCorrelations} に渡す 1 行。 */
export interface CrossSourceCorrelationRow {
  readonly correlationType: 'pr_review_session' | 'pr_review_release' | 'pr_finding_commit';
  readonly repoName: string;
  readonly sourceAKind: CrossSourceAKind;
  readonly sourceAId: string;
  readonly sourceBKind: CrossSourceBKind;
  readonly sourceBId: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly computedAt: string;
}

// ---------------------------------------------------------------------------
//  TrailDatabase
// ---------------------------------------------------------------------------

// Phase 5 S3 (KB Persistence) Shrink Audit の閾値。
// DatabaseIntegrityMonitor の既定（10% / 50 行）より高めに置く: グラフは正当な
// リファクタ・パッケージ削除でも縮むため、誤警報で警告が無視される方が保証の実効性を損なう。
const KB_SHRINK_LOSS_RATE = 0.5;
const KB_SHRINK_MIN_BEFORE = 20;

export class TrailDatabase {
  private db: Database | null = null;
  private readonly dbPath: string;
  private readonly storage: ITrailStorage;
  private readonly integrityMonitor = new DatabaseIntegrityMonitor();
  private onIntegrityAlert: ((alerts: readonly IntegrityAlert[]) => void) | null = null;
  // Phase 5 S3 (KB Persistence): グラフ系破壊的書込の Pre-write Snapshot と Shrink Audit。
  // snapshotter は file-backed ストレージのとき初回書込で lazy 自動配線する（呼び出し側の配線漏れ防止）。
  private kbSnapshotter: IKnowledgeBaseSnapshotter | null = null;
  private kbSnapshotterResolved = false;
  private onKbShrinkAlert: ((alert: KbShrinkAlert) => void) | null = null;

  /**
   * @param distPath sql-wasm.js / sql-wasm.wasm の配置ディレクトリ
   * @param storageDirOrStorage ディレクトリ文字列（互換 API）または ITrailStorage を直接注入
   */
  private readonly logger: DbLogger;

  constructor(
    private readonly distPath: string,
    storageDirOrStorage?: string | ITrailStorage,
    backupGenerations?: number,
    logger?: DbLogger,
    backupIntervalDays?: number,
  ) {
    if (storageDirOrStorage !== undefined && typeof storageDirOrStorage !== 'string') {
      this.storage = storageDirOrStorage;
      this.dbPath = this.storage.identifier;
    } else {
      const dbDir = storageDirOrStorage ?? DEFAULT_DB_DIR;
      this.dbPath = path.join(dbDir, 'trail.db');
      this.storage = new FileTrailStorage(this.dbPath, backupGenerations, backupIntervalDays);
    }
    this.logger = logger ?? noopDbLogger;
  }

  /** IntegrityMonitor が異常を検知したときに呼ばれるハンドラを登録。 */
  setIntegrityAlertHandler(handler: (alerts: readonly IntegrityAlert[]) => void): void {
    this.onIntegrityAlert = handler;
  }

  /** KB Pre-write Snapshot の提供者を注入する（テスト用。省略時は file-backed なら lazy 自動配線）。 */
  setKnowledgeBaseSnapshotter(snapshotter: IKnowledgeBaseSnapshotter | null): void {
    this.kbSnapshotter = snapshotter;
    this.kbSnapshotterResolved = snapshotter !== null;
  }

  /** Shrink Audit（グラフ総数の大幅減少）検知時に呼ばれるハンドラを登録。 */
  setKbShrinkAlertHandler(handler: (alert: KbShrinkAlert) => void): void {
    this.onKbShrinkAlert = handler;
  }

  /** 現存する KB スナップショット世代を返す（in-memory ストレージでは空配列）。 */
  listKnowledgeBaseSnapshots(): readonly KnowledgeBaseSnapshotEntry[] {
    return this.resolveKbSnapshotter()?.listSnapshots() ?? [];
  }

  /**
   * KB スナップショットから trail.db 全体を復元する。
   *
   * メモリ上の古い DB が復元結果を上書きしないよう close → ファイル復元 → 再 init の
   * 順で行い、復元後の DB に `rollback_executed`（kind:'kb_restore'）を記録して save する
   * （復元前に記録すると whole-file 復元でアクティブ DB から監査記録が消えるため）。
   * 復元失敗時も DB は開き直す。同じファイルを開く別プロセス（daemon 等）は
   * 呼び出し側が事前に停止すること。
   * @throws snapshotter が無い（in-memory）/ 指定世代が存在しない場合
   */
  async restoreKnowledgeBaseSnapshot(
    generation: number,
    actor: EmergencyEventInput['actor'] = 'human',
  ): Promise<{ restoredFrom: string; safetyCopy: string | null }> {
    const snapshotter = this.resolveKbSnapshotter();
    if (!snapshotter) {
      throw new Error('Knowledge base snapshot is unavailable for in-memory storage');
    }
    this.close();
    let result: { restoredFrom: string; safetyCopy: string | null };
    try {
      result = snapshotter.restoreSnapshot(generation);
    } finally {
      // 復元の成否によらず DB を開き直す（close したまま放置しない）
      await this.init();
    }
    this.recordEmergencyEvent({
      occurredAt: new Date().toISOString(),
      event: 'rollback_executed',
      reason: `KB snapshot restore (generation ${generation})`,
      actor,
      sessionId: null,
      detailJson: JSON.stringify({ kind: 'kb_restore', generation }),
    });
    this.save();
    return result;
  }

  /** snapshotter を解決する（file-backed なら初回に自動生成）。 */
  private resolveKbSnapshotter(): IKnowledgeBaseSnapshotter | null {
    if (!this.kbSnapshotterResolved) {
      this.kbSnapshotterResolved = true;
      const filePath = this.storage.getFilePath();
      if (filePath) {
        this.kbSnapshotter = new FileKnowledgeBaseSnapshotter(filePath, this.logger);
      }
    }
    return this.kbSnapshotter;
  }

  /**
   * グラフ系テーブルの破壊的書込直前に呼ぶ。オンディスク（直近 save() 結果）の
   * 書込前状態を世代退避する。失敗しても書込は止めない（fail-open）。
   */
  private maybeSnapshotKb(trigger: KnowledgeBaseWriteTrigger): void {
    try {
      this.resolveKbSnapshotter()?.snapshotBeforeDestructiveWrite(trigger);
    } catch (err) {
      // snapshotter 側も fail-open 契約だが、契約違反の throw でも書込を巻き込まない
      this.logger.warn(
        `[kb-snapshot] unexpected failure (fail-open, trigger=${trigger}): ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
  }

  /** graph_json 内のノード + エッジ総数を読む（行なし・parse 失敗は null = 監査 skip）。 */
  private readKbGraphTotals(db: Database, table: 'current_graphs' | 'current_code_graphs', repoId: number): number | null {
    const result = db.exec(`SELECT graph_json FROM ${table} WHERE repo_id = ?`, [repoId]);
    const json = result[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    try {
      const graph = JSON.parse(json) as { nodes?: readonly unknown[]; edges?: readonly unknown[] };
      return (graph.nodes?.length ?? 0) + (graph.edges?.length ?? 0);
    } catch (err) {
      this.logger.warn(`[kb-audit] graph_json parse failed (${table}, repo_id=${repoId}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Shrink Audit: 書込後の総数が閾値（50% 以上減少かつ書込前 20 以上）を超えて
   * 縮小していたら emergency_log へ記録し、ハンドラへ通知する。
   * delete 系（意図的全消去）では呼ばない — 常に誤警報になるため。
   */
  private auditKbShrink(alert: Omit<KbShrinkAlert, 'lossRate'>): void {
    const { before, after } = alert;
    if (before < KB_SHRINK_MIN_BEFORE) return;
    const lossRate = (before - after) / before;
    if (lossRate < KB_SHRINK_LOSS_RATE) return;
    const full: KbShrinkAlert = { ...alert, lossRate };
    this.recordEmergencyEvent({
      occurredAt: new Date().toISOString(),
      event: 'anomaly_detected',
      reason: `KB shrink detected: ${alert.table} (${alert.repoName}) ${before} -> ${after}`,
      actor: 'agent',
      sessionId: null,
      detailJson: JSON.stringify({ kind: 'kb_shrink', ...full }),
    });
    this.onKbShrinkAlert?.(full);
  }

  /**
   * SQL 計測ヘルパー。fn を実行して所要時間と任意の rowCount を logger.debugSql に流す。
   * TRAIL_DEBUG_SQL=1 の時のみ TrailLogger 側で OutputChannel に出力される。
   * 失敗時はログを出さず例外をそのまま伝播する。
   */
  private runQuery<T>(name: string, fn: () => T, getRowCount?: (result: T) => number): T {
    const t0 = (typeof performance === 'undefined' ? Date : performance).now();
    const result = fn();
    const t1 = (typeof performance === 'undefined' ? Date : performance).now();
    const meta: { name: string; durationMs: number; rowCount?: number } = {
      name,
      durationMs: t1 - t0,
    };
    if (getRowCount) meta.rowCount = getRowCount(result);
    this.logger.debugSql(meta);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────
  //  集計ヘルパー
  //  系統 1: byDateRange  — rebuildDailyCounts の kind='tool' (L1839 起源)
  //  系統 2: bySession    — computeToolMetrics の tool/skill (L4948/L4989 起源)
  //  系統 3: byMessageDateCutoff — getCombinedData (L5430 起源)
  //  各ヘルパーは A-4 で call site を集約済み。Phase A-3 で内部 SQL を順次
  //  範囲スキャン+TS 集計へ置換する（系統 1 完了 / 系統 2,3 未着手）。
  // ─────────────────────────────────────────────────────────────────

  /**
   * SQL の `tool_name LIKE 'mcp\_\_%\_\_%' ESCAPE '\' THEN SUBSTR(...)` を JS で再現。
   * "mcp__SERVER__TOOL" 形式のとき "mcp__SERVER" まで切り出す。それ以外は元値を返す。
   */
  private applyToolMcpAlias(toolName: string): string {
    if (!toolName.startsWith('mcp__')) return toolName;
    const rest = toolName.slice(5);
    const pos = rest.indexOf('__');
    if (pos < 0) return toolName;
    return toolName.slice(0, pos + 5);
  }

  /**
   * SQL の `DATE(timestamp, '+540 minutes')` を JS で再現。tzOffset は
   * `getSqliteTzOffset()` の出力形式（"+540 minutes" / "-300 minutes"）を期待する。
   * ISO 8601 timestamp を UTC ms に変換 → オフセット分加算 → YYYY-MM-DD を抽出。
   */
  private computeDateInSqliteTz(isoTimestamp: string | null | undefined, tzOffset: string): string {
    if (!isoTimestamp) return '';
    const m = /^([+-])(\d+) minutes$/.exec(tzOffset);
    const ms = Date.parse(isoTimestamp);
    if (!m || Number.isNaN(ms)) {
      const head = isoTimestamp.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : '';
    }
    const sign = m[1] === '+' ? 1 : -1;
    const offsetMin = sign * Number(m[2]);
    const shifted = new Date(ms + offsetMin * 60000);
    const yyyy = shifted.getUTCFullYear();
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * SQL の `strftime('%Y-W%W', timestamp, '+540 minutes')` を JS で再現。
   * SQLite の %W: 月曜始まりの週番号 (00-53)。年初の最初の月曜より前は週 00。
   * 出力フォーマット: `YYYY-W##`
   */
  private computeWeekInSqliteTz(isoTimestamp: string, tzOffset: string): string {
    const m = /^([+-])(\d+) minutes$/.exec(tzOffset);
    const ms = Date.parse(isoTimestamp);
    if (!m || Number.isNaN(ms)) return '';
    const sign = m[1] === '+' ? 1 : -1;
    const offsetMin = sign * Number(m[2]);
    const shifted = new Date(ms + offsetMin * 60000);
    const year = shifted.getUTCFullYear();
    const jan1Ms = Date.UTC(year, 0, 1);
    const jan1Day = new Date(jan1Ms).getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysToFirstMonday = (8 - jan1Day) % 7; // Mon=0, Tue=6, Sun=1
    const firstMondayMs = jan1Ms + daysToFirstMonday * 86400000;
    const dateMs = shifted.getTime();
    let week: number;
    if (dateMs < firstMondayMs) {
      week = 0;
    } else {
      week = Math.floor((dateMs - firstMondayMs) / (7 * 86400000)) + 1;
    }
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * SQLite の IN 句変数上限 (デフォルト 999) を考慮し、items を batchSize 件ずつに
   * 分割して fn を呼び出す。fn の戻り値の配列を結合して返す。
   */
  private fetchInBatches<TItem, TRow>(
    items: readonly TItem[],
    batchSize: number,
    fn: (batch: readonly TItem[]) => readonly TRow[],
  ): TRow[] {
    const out: TRow[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const rows = fn(batch);
      for (const r of rows) out.push(r);
    }
    return out;
  }

  /**
   * 系統 1: tzOffset 適用日付別の tool 利用集計。
   * rebuildDailyCounts の kind='tool' 集計用。
   *
   * Phase A-3: 旧 SQL (CTE + LEFT JOIN + window + GROUP BY) を範囲スキャン 2 本 +
   * TS 集計に置き換える。message_tool_calls 全件 + 出現 message_uuid に対する
   * messages バッチ取得で msg_tokens を解決し、tools_in_msg / tools_in_turn は
   * Map で算出。LEFT JOIN の semantics（messages 行が無い場合 msg_tokens=0）と
   * SQL の SUM(ROUND(1.0 * x / y)) の按分順序を完全保持する。
   */
  private aggregateToolUsageByDateRange(tzOffset: string): readonly {
    date: string; tool: string; count: number; tokens: number; durationMs: number;
  }[] {
    const db = this.ensureDb();
    return this.runQuery(
      'aggregateToolUsageByDateRange',
      () => {
        // Phase 1: message_tool_calls 全件範囲スキャン（rebuildDailyCounts は WHERE 無し）
        const tcResult = db.exec(
          `SELECT session_id, message_uuid, turn_index, tool_name, timestamp,
                  COALESCE(turn_exec_ms, 0) AS turn_exec_ms
           FROM message_tool_calls`,
        );
        const tcRows = tcResult[0]?.values ?? [];
        if (tcRows.length === 0) return [];

        // Phase 1.5: session start_time を取得し、日付キーを session 基準で算出するための Map 構築
        const sessionIds1 = [...new Set(tcRows.map((r) => r[0] as string))];
        const SQLITE_VAR_LIMIT = 999;
        const sessionDateMap = new Map<string, string>();
        this.fetchInBatches(sessionIds1, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const sResult = db.exec(
            `SELECT id, start_time FROM sessions WHERE id IN (${placeholders})`,
            batch,
          );
          for (const r of sResult[0]?.values ?? []) {
            const sid = r[0] as string;
            const st = r[1] as string;
            if (st) sessionDateMap.set(sid, this.computeDateInSqliteTz(st, tzOffset));
          }
          return [];
        });

        // Phase 2: 出現する message_uuid 集合
        const messageUuids = new Set<string>();
        for (const row of tcRows) messageUuids.add(row[1] as string);

        // Phase 3: messages を uuid IN (?) でバッチ取得し msg_tokens Map 構築
        // LEFT JOIN semantics 保持: 該当行が無い uuid は Map に入らず後段で 0 扱い
        const msgTokensByUuid = new Map<string, number>();
        const uuidList = [...messageUuids];
        this.fetchInBatches(uuidList, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const msgResult = db.exec(
            `SELECT uuid, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS msg_tokens
             FROM messages WHERE uuid IN (${placeholders})`,
            batch,
          );
          for (const r of msgResult[0]?.values ?? []) {
            msgTokensByUuid.set(r[0] as string, r[1] as number);
          }
          return [];
        });

        // Phase 4: tools_in_msg / tools_in_turn を算出
        const TURN_KEY_SEP = '\x1f';
        const toolsInMsg = new Map<string, number>();
        const toolsInTurn = new Map<string, number>();
        for (const row of tcRows) {
          const messageUuid = row[1] as string;
          const turnKey = `${row[0]}${TURN_KEY_SEP}${row[2]}`;
          toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
          toolsInTurn.set(turnKey, (toolsInTurn.get(turnKey) ?? 0) + 1);
        }

        // Phase 5: (date, tool) 単位で count / tokens / durationMs を集計
        // SUM(ROUND(1.0 * x / y)) と同等のため、各行で round → 集計 を踏襲する
        type Agg = { count: number; tokens: number; duration: number };
        const aggMap = new Map<string, Agg>();
        for (const row of tcRows) {
          const sessionId = row[0] as string;
          const messageUuid = row[1] as string;
          const turnIndex = row[2];
          const toolName = row[3] as string;
          const timestamp = row[4] as string;
          const turnExecMs = Number(row[5] ?? 0);

          const tool = this.applyToolMcpAlias(toolName);
          // session start_time 基準の日付（未取得の場合は tool call timestamp にフォールバック）
          const date = sessionDateMap.get(sessionId) ?? this.computeDateInSqliteTz(timestamp, tzOffset);

          const msgTokens = msgTokensByUuid.get(messageUuid) ?? 0;
          const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
          const tokensContrib = Math.round(msgTokens / tInMsg);

          const turnKey = `${sessionId}${TURN_KEY_SEP}${turnIndex}`;
          const tInTurn = toolsInTurn.get(turnKey) ?? 1;
          const durationContrib = Math.round(turnExecMs / tInTurn);

          const aggKey = `${date}${TURN_KEY_SEP}${tool}`;
          const cur = aggMap.get(aggKey) ?? { count: 0, tokens: 0, duration: 0 };
          cur.count += 1;
          cur.tokens += tokensContrib;
          cur.duration += durationContrib;
          aggMap.set(aggKey, cur);
        }

        // Phase 6: 結果配列へ変換
        return [...aggMap.entries()].map(([key, agg]) => {
          const sep = key.indexOf(TURN_KEY_SEP);
          return {
            date: key.slice(0, sep),
            tool: key.slice(sep + 1),
            count: agg.count,
            tokens: agg.tokens,
            durationMs: agg.duration,
          };
        });
      },
      (rows) => rows.length,
    );
  }

  /**
   * 系統 2 共通実装: セッション内の tool/skill 別利用集計。
   * 内部は range scan + uuid IN バッチ + TS 集計。LEFT JOIN semantics と
   * SUM(ROUND(1.0 * x / y)) の按分順序を完全保持する。
   * tools_in_msg / tools_in_turn は CTE フィルタ後の対象集合に対して計算する
   * （旧 SQL の `WHERE ... [AND skill_name IS NOT NULL]` を CTE 内に持たせていた挙動と一致）。
   */
  private aggregateBySessionInternal(
    sessionId: string,
    groupKeyColumn: 'tool_name' | 'skill_name',
    skipNullKey: boolean,
  ): readonly { key: string; count: number; tokens: number; durationMs: number }[] {
    const db = this.ensureDb();
    // Phase 1: message_tool_calls を session 範囲スキャン
    //   skipNullKey=true のとき skill_name IS NOT NULL を WHERE に含める
    const sql = skipNullKey
      ? `SELECT message_uuid, turn_index, ${groupKeyColumn} AS key_col,
              COALESCE(turn_exec_ms, 0) AS turn_exec_ms
         FROM message_tool_calls
         WHERE session_id = ? AND ${groupKeyColumn} IS NOT NULL`
      : `SELECT message_uuid, turn_index, ${groupKeyColumn} AS key_col,
              COALESCE(turn_exec_ms, 0) AS turn_exec_ms
         FROM message_tool_calls
         WHERE session_id = ?`;
    const tcResult = db.exec(sql, [sessionId]);
    const tcRows = tcResult[0]?.values ?? [];
    if (tcRows.length === 0) return [];

    // Phase 2: 出現する message_uuid 集合
    const messageUuids = new Set<string>();
    for (const row of tcRows) messageUuids.add(row[0] as string);

    // Phase 3: messages を uuid IN (?) でバッチ取得して msg_tokens Map 構築
    const SQLITE_VAR_LIMIT = 999;
    const msgTokensByUuid = new Map<string, number>();
    const uuidList = [...messageUuids];
    this.fetchInBatches(uuidList, SQLITE_VAR_LIMIT, (batch) => {
      const placeholders = batch.map(() => '?').join(',');
      const msgResult = db.exec(
        `SELECT uuid, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS msg_tokens
         FROM messages WHERE uuid IN (${placeholders})`,
        batch,
      );
      for (const r of msgResult[0]?.values ?? []) {
        msgTokensByUuid.set(r[0] as string, r[1] as number);
      }
      return [];
    });

    // Phase 4: tools_in_msg / tools_in_turn を CTE 後集合に対して算出
    // session_id 部分は単一 session なので turnKey は turn_index のみで十分
    const toolsInMsg = new Map<string, number>();
    const toolsInTurn = new Map<number | string, number>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnIndex = row[1] as number | string;
      toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
      toolsInTurn.set(turnIndex, (toolsInTurn.get(turnIndex) ?? 0) + 1);
    }

    // Phase 5: groupKey 単位で集計
    type Agg = { count: number; tokens: number; duration: number };
    const aggMap = new Map<string, Agg>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnIndex = row[1] as number | string;
      const rawKey = row[2] as string;
      const turnExecMs = Number(row[3] ?? 0);

      // tool 列のみ MCP alias を適用、skill 列はそのまま
      const key = groupKeyColumn === 'tool_name' ? this.applyToolMcpAlias(rawKey) : rawKey;

      const msgTokens = msgTokensByUuid.get(messageUuid) ?? 0;
      const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
      const tokensContrib = Math.round(msgTokens / tInMsg);

      const tInTurn = toolsInTurn.get(turnIndex) ?? 1;
      const durationContrib = Math.round(turnExecMs / tInTurn);

      const cur = aggMap.get(key) ?? { count: 0, tokens: 0, duration: 0 };
      cur.count += 1;
      cur.tokens += tokensContrib;
      cur.duration += durationContrib;
      aggMap.set(key, cur);
    }

    // Phase 6: 結果配列へ変換 + count DESC でソート（旧 SQL の ORDER BY count DESC を保持）
    return [...aggMap.entries()]
      .map(([key, agg]) => ({
        key,
        count: agg.count,
        tokens: agg.tokens,
        durationMs: agg.duration,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 指定日 (JST) のセッション start_time 基準で tool/skill 別利用集計。
   * getDayToolMetrics 用: daily_counts (timestamp 基準) の代替。
   * aggregateBySessionInternal と同実装だが WHERE が session start_time date。
   */
  private aggregateByDayInternal(
    date: string,
    groupKeyColumn: 'tool_name' | 'skill_name',
    skipNullKey: boolean,
  ): readonly { key: string; count: number; tokens: number; durationMs: number }[] {
    const db = this.ensureDb();
    const nullFilter = skipNullKey ? ` AND mtc.${groupKeyColumn} IS NOT NULL` : '';
    const tcResult = db.exec(
      `SELECT mtc.message_uuid, mtc.turn_index, mtc.session_id,
              mtc.${groupKeyColumn} AS key_col,
              COALESCE(mtc.turn_exec_ms, 0) AS turn_exec_ms
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE DATE(s.start_time, '+540 minutes') = ?${nullFilter}`,
      [date],
    );
    const tcRows = tcResult[0]?.values ?? [];
    if (tcRows.length === 0) return [];

    const messageUuids = new Set<string>();
    for (const row of tcRows) messageUuids.add(row[0] as string);

    const SQLITE_VAR_LIMIT = 999;
    const msgTokensByUuid = new Map<string, number>();
    this.fetchInBatches([...messageUuids], SQLITE_VAR_LIMIT, (batch) => {
      const placeholders = batch.map(() => '?').join(',');
      const msgResult = db.exec(
        `SELECT uuid, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) AS msg_tokens
         FROM messages WHERE uuid IN (${placeholders})`,
        batch,
      );
      for (const r of msgResult[0]?.values ?? []) {
        msgTokensByUuid.set(r[0] as string, r[1] as number);
      }
      return [];
    });

    const TURN_KEY_SEP = '\x1f';
    const toolsInMsg = new Map<string, number>();
    const toolsInTurn = new Map<string, number>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnKey = `${row[2]}${TURN_KEY_SEP}${row[1]}`;
      toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
      toolsInTurn.set(turnKey, (toolsInTurn.get(turnKey) ?? 0) + 1);
    }

    type Agg = { count: number; tokens: number; duration: number };
    const aggMap = new Map<string, Agg>();
    for (const row of tcRows) {
      const messageUuid = row[0] as string;
      const turnIndex = row[1];
      const sessionId = row[2] as string;
      const rawKey = row[3] as string | null;
      const turnExecMs = Number(row[4] ?? 0);
      if (rawKey === null) continue;
      const key = groupKeyColumn === 'tool_name' ? this.applyToolMcpAlias(rawKey) : rawKey;

      const msgTokens = msgTokensByUuid.get(messageUuid) ?? 0;
      const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
      const tokensContrib = Math.round(msgTokens / tInMsg);

      const turnKey = `${sessionId}${TURN_KEY_SEP}${turnIndex}`;
      const tInTurn = toolsInTurn.get(turnKey) ?? 1;
      const durationContrib = Math.round(turnExecMs / tInTurn);

      const cur = aggMap.get(key) ?? { count: 0, tokens: 0, duration: 0 };
      cur.count += 1;
      cur.tokens += tokensContrib;
      cur.duration += durationContrib;
      aggMap.set(key, cur);
    }

    return [...aggMap.entries()]
      .map(([key, agg]) => ({ key, count: agg.count, tokens: agg.tokens, durationMs: agg.duration }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 系統 2 (tool): セッション内の tool 別利用集計。
   * computeToolMetrics の toolUsage 用 (L4948 起源)。
   */
  private aggregateToolUsageBySession(sessionId: string): readonly {
    tool: string; count: number; tokens: number; durationMs: number;
  }[] {
    return this.runQuery(
      'aggregateToolUsageBySession',
      () => this.aggregateBySessionInternal(sessionId, 'tool_name', false)
        .map((r) => ({ tool: r.key, count: r.count, tokens: r.tokens, durationMs: r.durationMs })),
      (rows) => rows.length,
    );
  }

  /**
   * 系統 2 (skill): セッション内の skill 別利用集計。
   * computeToolMetrics の skillUsage 用 (L4989 起源)。skill_name IS NOT NULL を強制。
   */
  private aggregateSkillUsageBySession(sessionId: string): readonly {
    skill: string; count: number; tokens: number; durationMs: number;
  }[] {
    return this.runQuery(
      'aggregateSkillUsageBySession',
      () => this.aggregateBySessionInternal(sessionId, 'skill_name', true)
        .map((r) => ({ skill: r.key, count: r.count, tokens: r.tokens, durationMs: r.durationMs })),
      (rows) => rows.length,
    );
  }

  /** Inner loop for aggregateToolUsageByMessageDateCutoff — processes tc rows into aggMap. */
  private aggregateToolUsageTcRows(
    tcRows: readonly unknown[][],
    period: 'day' | 'week',
    tzOffset: string,
    cutoffDate: string,
    ctx: {
      toolsInMsg: Map<string, number>;
      toolsInTurn: Map<string, number>;
      msgInfoMap: Map<string, {
        type: string; timestamp: string; sessionId: string;
        inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      }>;
      sessionSourceMap: Map<string, string>;
      sessionStartTsMap: Map<string, string>;
    },
    sep: string,
    aggMap: Map<string, { count: number; tokens: number; duration: number; tokenTotalTurns: number; tokenMissingTurns: number }>,
  ): void {
    const { toolsInMsg, toolsInTurn, msgInfoMap, sessionSourceMap, sessionStartTsMap } = ctx;
    for (const row of tcRows) {
      const sessionIdTc = row[0] as string;
      const messageUuid = row[1] as string;
      const turnIndex = row[2];
      const toolName = row[3] as string;
      const turnExecMs = Number(row[4] ?? 0);

      const m = msgInfoMap.get(messageUuid);
      if (!m) continue;
      const source = sessionSourceMap.get(m.sessionId);
      if (source === undefined) continue;

      const sessionTs = sessionStartTsMap.get(m.sessionId) ?? m.timestamp;
      const sessionDate = this.computeDateInSqliteTz(sessionTs, tzOffset);
      if (sessionDate < cutoffDate) continue;

      const periodKey = period === 'day' ? sessionDate : this.computeWeekInSqliteTz(sessionTs, tzOffset);
      const tool = this.applyToolMcpAlias(toolName);
      const tInMsg = toolsInMsg.get(messageUuid) ?? 1;
      const tInTurn = toolsInTurn.get(`${sessionIdTc}${sep}${turnIndex}`) ?? 1;
      const tokensContrib = Math.round((m.inputTokens + m.outputTokens) / tInMsg);
      const durationContrib = Math.round(turnExecMs / tInTurn);
      const isAssistant = m.type === 'assistant';
      const allZero = m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheCreationTokens === 0;

      const aggKey = `${periodKey}${sep}${tool}${sep}${source}`;
      const cur = aggMap.get(aggKey) ?? { count: 0, tokens: 0, duration: 0, tokenTotalTurns: 0, tokenMissingTurns: 0 };
      cur.count += 1;
      cur.tokens += tokensContrib;
      cur.duration += durationContrib;
      cur.tokenTotalTurns += isAssistant ? 1 : 0;
      cur.tokenMissingTurns += isAssistant && allZero ? 1 : 0;
      aggMap.set(aggKey, cur);
    }
  }

  /**
   * 系統 3: messages.timestamp の cutoff + sessions JOIN + period 別の tool 集計。
   * getCombinedData の toolRawResult 用 (L5430 起源)。
   *
   * Phase A-3: 旧 SQL (subquery + window + INNER JOIN x2 + GROUP BY) を範囲スキャン
   * 3 本 (message_tool_calls / messages / sessions) + TS 集計に置き換える。
   * 引数を SQL fragment から semantic discriminator (rangeDays, period, tzOffset) に
   * 変更し、cutoffDate のみ SQLite の `DATE('now', '-Nd')` で算出して既存セマンティクス
   * (UTC 基準の cutoff vs JST 基準の messageDate を文字列比較する) を完全保持する。
   *
   * factor 補正に必要な token_total_turns / token_missing_turns を含む raw 行を返し、
   * factor 計算は呼び出し側 (getCombinedData) が行う。
   *
   * 保持する semantics:
   * - tools_in_msg / tools_in_turn は filter 前の全 message_tool_calls 集合に対して計算
   * - INNER JOIN messages: 該当 m が無い tc は除外
   * - INNER JOIN sessions: m.session_id に該当 s が無い行は除外
   * - token_total_turns / token_missing_turns は per-tc 行カウント（per-message ではない）
   * - tool_name の MCP alias 適用
   * - SUM(ROUND(1.0 * x / y)) の按分順序
   */
  private aggregateToolUsageByMessageDateCutoff(
    rangeDays: number,
    period: 'day' | 'week',
    tzOffset: string,
  ): readonly Record<string, unknown>[] {
    const db = this.ensureDb();
    return this.runQuery(
      'aggregateToolUsageByMessageDateCutoff',
      () => {
        // Step 1: cutoffDate は SQLite の DATE('now', '-Nd') を 1 回だけ実行して取得
        // 既存 SQL の `WHERE DATE(m.timestamp, tzOffset) >= DATE('now', '-Nd')` は
        // 「JST 日付 >= UTC 日付」の文字列比較で評価されるため、cutoffDate は UTC 日付
        const cutoffResult = db.exec(`SELECT DATE('now', '-${rangeDays} days') AS d`);
        const cutoffDate = asText(cutoffResult[0]?.values[0]?.[0] ?? '');

        // Step 2: message_tool_calls 全件範囲スキャン
        const tcResult = db.exec(
          `SELECT session_id, message_uuid, turn_index, tool_name, COALESCE(turn_exec_ms, 0) AS turn_exec_ms
           FROM message_tool_calls`,
        );
        const tcRows = tcResult[0]?.values ?? [];
        if (tcRows.length === 0) return [];

        // Step 3: filter 前の全集合に対して tools_in_msg / tools_in_turn を算出
        const TURN_KEY_SEP = '\x1f';
        const toolsInMsg = new Map<string, number>();
        const toolsInTurn = new Map<string, number>();
        for (const row of tcRows) {
          const messageUuid = row[1] as string;
          const turnKey = `${row[0]}${TURN_KEY_SEP}${row[2]}`;
          toolsInMsg.set(messageUuid, (toolsInMsg.get(messageUuid) ?? 0) + 1);
          toolsInTurn.set(turnKey, (toolsInTurn.get(turnKey) ?? 0) + 1);
        }

        // Step 4: 出現する message_uuid に対する messages を uuid IN バッチ取得
        const SQLITE_VAR_LIMIT = 999;
        const uuidList = [...new Set(tcRows.map((r) => r[1] as string))];
        type MsgInfo = {
          type: string;
          timestamp: string;
          sessionId: string;
          inputTokens: number;
          outputTokens: number;
          cacheReadTokens: number;
          cacheCreationTokens: number;
        };
        const msgInfoMap = new Map<string, MsgInfo>();
        this.fetchInBatches(uuidList, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const msgResult = db.exec(
            `SELECT uuid, type, timestamp, session_id,
                    COALESCE(input_tokens, 0), COALESCE(output_tokens, 0),
                    COALESCE(cache_read_tokens, 0), COALESCE(cache_creation_tokens, 0)
             FROM messages WHERE uuid IN (${placeholders})`,
            batch,
          );
          for (const r of msgResult[0]?.values ?? []) {
            msgInfoMap.set(r[0] as string, {
              type: r[1] as string,
              timestamp: r[2] as string,
              sessionId: r[3] as string,
              inputTokens: Number(r[4] ?? 0),
              outputTokens: Number(r[5] ?? 0),
              cacheReadTokens: Number(r[6] ?? 0),
              cacheCreationTokens: Number(r[7] ?? 0),
            });
          }
          return [];
        });

        // Step 5: messages から派生した session_id 集合に対する sessions を id IN バッチ取得
        const sessionIds = [...new Set([...msgInfoMap.values()].map((m) => m.sessionId))];
        const sessionSourceMap = new Map<string, string>();
        const sessionStartTsMap = new Map<string, string>(); // session_id → start_time (UTC ISO)
        this.fetchInBatches(sessionIds, SQLITE_VAR_LIMIT, (batch) => {
          const placeholders = batch.map(() => '?').join(',');
          const sessResult = db.exec(
            `SELECT id, source, start_time FROM sessions WHERE id IN (${placeholders})`,
            batch,
          );
          for (const r of sessResult[0]?.values ?? []) {
            sessionSourceMap.set(r[0] as string, r[1] as string);
            const st = r[2] as string | null;
            if (st) sessionStartTsMap.set(r[0] as string, st);
          }
          return [];
        });

        // Step 6: tc 行を走査し INNER JOIN + WHERE 適用 + (period, tool, source) 集計
        type Agg = {
          count: number;
          tokens: number;
          duration: number;
          tokenTotalTurns: number;
          tokenMissingTurns: number;
        };
        const aggMap = new Map<string, Agg>();
        this.aggregateToolUsageTcRows(
          tcRows, period, tzOffset, cutoffDate,
          { toolsInMsg, toolsInTurn, msgInfoMap, sessionSourceMap, sessionStartTsMap },
          TURN_KEY_SEP, aggMap,
        );

        // Step 7: caller 互換のため Record<string, unknown>[] として返却
        return [...aggMap.entries()].map(([key, agg]) => {
          const parts = key.split(TURN_KEY_SEP);
          return {
            period: parts[0],
            tool: parts[1],
            source: parts[2],
            count: agg.count,
            tokens: agg.tokens,
            duration_ms: agg.duration,
            token_total_turns: agg.tokenTotalTurns,
            token_missing_turns: agg.tokenMissingTurns,
          };
        });
      },
      (rows) => rows.length,
    );
  }

  /** 利用可能な世代バックアップを新しい順で返す。FileTrailStorage 以外では空配列。 */
  listBackups(): readonly import('./ITrailStorage').BackupEntry[] {
    if (this.storage instanceof FileTrailStorage) {
      return this.storage.listBackups();
    }
    return [];
  }

  /**
   * 指定世代のバックアップから DB を復元する。復元後にメモリ内の DB は
   * 古いままなので、呼び出し元は拡張機能を再起動する必要がある。
   * FileTrailStorage 以外が注入されている場合は例外を投げる。
   */
  restoreFromBackup(generation: number): { restoredFrom: string; safetyCopy: string | null } {
    if (!(this.storage instanceof FileTrailStorage)) {
      throw new TypeError('restoreFromBackup is only supported with FileTrailStorage');
    }
    this.close();
    return this.storage.restoreFromBackup(generation);
  }

  async init(): Promise<void> {
    // バックアップ世代ローテーション: better-sqlite3 が DB ファイルを開いて
    // 書き込み始める前に、現存する .db ファイルの状態を .bak.1.gz に圧縮退避する。
    // FileTrailStorage 以外のストレージ (in-memory 等) では maybeRotateBackup は
    // 未定義のため何もしない。同一インスタンス内で 1 回だけ作動する設計のため、
    // 同 TrailDatabase の init を複数回呼んでも安全。
    this.storage.maybeRotateBackup?.();

    // better-sqlite3 は webpack bundle 環境では `'better-sqlite3': 'commonjs better-sqlite3'`
    // で externals 化されており、ランタイムで `dist/node_modules/better-sqlite3/` の
    // native binary を解決する。memory-core と同じパターン。
    // 旧 sql.js + sql-wasm 16/2GB ヒープ制約は better-sqlite3 (ネイティブ) では発生しない。
    //
    // nativeBinding: webpack-bundled VS Code 拡張では bindings package の getFileName が
    // call stack を辿って .node のパスを推測する処理が壊れる (一つのバンドル JS から
    // 呼び出されるため module path が判別できず "Cannot read properties of undefined
    // (reading 'indexOf')" で fail)。bindings 推測を回避するため .node の絶対パスを
    // 直接渡す。dist/node_modules/better-sqlite3/build/Release/better_sqlite3.node を
    // CopyWebpackPlugin で配置済みの場合だけ採用し、それ以外 (テスト等) は bindings の
    // 通常解決に任せる。
    const Ctor = loadBetterSqlite3();
    const filePath = this.storage.getFilePath();
    const nativeBinding = path.join(
      this.distPath,
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    );
    const options = fs.existsSync(nativeBinding) ? { nativeBinding } : {};
    // better-sqlite3 は親ディレクトリが存在しないと "Cannot open database because the
    // directory does not exist" で開けない。sql.js 時代は load 経路の readInitialBytes() が
    // mkdir していたが、better-sqlite3 移行で init() は getFilePath() のみを使うため
    // ディレクトリ作成が漏れていた (新規環境・初回 activate でクラッシュ)。ここで補う。
    if (filePath) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const inner = new Ctor(filePath ?? ':memory:', options);
    // FK 制約は intentionally OFF。sql.js 時代は createTables() の
    // PRAGMA foreign_keys = ON が WASM 側で no-op だったため事実上 FK 未強制で
    // 動いており、既存テスト fixture / production 既存データはこれに依存している
    // (orphan source_tool_assistant_uuid や delegation-only message 等)。
    // better-sqlite3 はネイティブで強制するため、ここで OFF を明示し sql.js と
    // 同じ "schema は FK 宣言を持つが runtime は強制しない" 状態を維持する。
    // 将来 orphan データの cleanup + FK 強制を separate plan で進める想定。
    inner.pragma('foreign_keys = OFF');
    this.db = new SqlJsCompatDatabase(inner, filePath);
    this.logger.info(
      `[TrailDatabase] better-sqlite3 initialized, storage = ${this.storage.identifier}`,
    );

    this.createTables();
    const initDb = this.ensureDb();
    // repos を既存テーブルの repo_name から seed (Phase A・冪等)。
    this.seedReposFromLegacyRepoNames(initDb);
    // releases.repo_id を追加・backfill (Phase B step1・非破壊。FK は off のまま)。
    this.migrateReleasesRepoIdColumn(initDb);
    this.backfillReleaseRepoIds(initDb);
    this.backfillReleaseIds(initDb);
    this.migrateReleaseChildrenReleaseId(initDb);
    // Phase 5 S4: emergency_log.event へ section_lock 系を追加（CHECK 変更 = 12-step 再構築）。
    this.migrateEmergencyLogEventKinds(initDb);
  }

  /**
   * emergency_log の event CHECK に section_lock_denied / section_lock_tamper を含まない
   * 既存 DB を新スキーマへ 12-step 再構築する（列は同一・行を id ごと保持）。冪等。
   */
  private migrateEmergencyLogEventKinds(db: Database): void {
    const row = db.exec(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='emergency_log'`,
    )[0]?.values?.[0]?.[0];
    const currentSql = asText(row ?? '');
    if (currentSql === '' || currentSql.includes('section_lock_denied')) return;
    try {
      db.run('BEGIN');
      try {
        db.run('DROP TABLE IF EXISTS emergency_log__new');
        db.run(
          CREATE_EMERGENCY_LOG.replace(
            'CREATE TABLE IF NOT EXISTS emergency_log',
            'CREATE TABLE emergency_log__new',
          ),
        );
        db.run(
          `INSERT INTO emergency_log__new (id, occurred_at, event, reason, actor, session_id, detail_json)
           SELECT id, occurred_at, event, reason, actor, session_id, detail_json FROM emergency_log`,
        );
        db.run('DROP TABLE emergency_log');
        db.run('ALTER TABLE emergency_log__new RENAME TO emergency_log');
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
      // テーブル DROP でインデックスも消えるため再作成（IF NOT EXISTS で冪等）。
      for (const idx of CREATE_EMERGENCY_INDEXES) {
        db.run(idx);
      }
      this.save();
      this.logger.info('[TrailDatabase] migrated emergency_log event kinds (Phase 5 S4)');
    } catch (e) {
      this.logger.error(
        'migrateEmergencyLogEventKinds failed',
        e instanceof Error ? e : new Error(String(e)),
      );
      throw e;
    }
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error('TrailDatabase not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * `BEGIN` → `fn` → `COMMIT` を実行し、例外時は `ROLLBACK` して再 throw する。
   * 洗い替え・upsert 系メソッド (DELETE+INSERT) のトランザクション境界を集約する。
   */
  private withTransaction<T>(fn: (db: Database) => T): T {
    const db = this.ensureDb();
    db.run('BEGIN');
    try {
      const result = fn(db);
      db.run('COMMIT');
      return result;
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  }

  // ── repo 正規化基盤 (Phase A) ───────────────────────────────────────────
  // repo_name TEXT の散在を repos(repo_id) 代理キーへ集約するための入口。
  // 後続 Phase で各テーブルの repo_name を repo_id FK へ移行するまで、
  // 新規 write path は repo_name 保存前に repoIdForName() を通す運用とする。

  /** repo_name から repo_id を取得する。未登録なら登録してから返す (upsert・冪等)。 */
  repoIdForName(repoName: string): number {
    const db = this.ensureDb();
    db.run(
      `INSERT INTO repos (repo_name, created_at)
       VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(repo_name) DO NOTHING`,
      [repoName],
    );
    const res = db.exec('SELECT repo_id FROM repos WHERE repo_name = ?', [repoName]);
    const id = res[0]?.values?.[0]?.[0];
    return Number(id);
  }

  /**
   * repo_name から repo_id を取得する (read-only)。repos へ upsert しないため、
   * 純粋 read メソッドの repo フィルタに使う。未登録の repo は -1 (どの行にも
   * マッチしない sentinel) を返し、空結果を返させる (mcp-trail の lookupRepoId と同じ思想)。
   * upsert する repoIdForName と異なり幽霊行を作らず、読み取り専用 DB でも throw しない。
   */
  private repoIdForNameReadonly(repoName: string): number {
    const db = this.ensureDb();
    const res = db.exec('SELECT repo_id FROM repos WHERE repo_name = ?', [repoName]);
    const id = res[0]?.values?.[0]?.[0];
    return id == null ? -1 : Number(id);
  }

  /** repo_id から repo_name を引く。未知の id は null。 */
  repoNameForId(repoId: number): string | null {
    const db = this.ensureDb();
    const res = db.exec('SELECT repo_name FROM repos WHERE repo_id = ?', [repoId]);
    const name = res[0]?.values?.[0]?.[0];
    return name == null ? null : asText(name);
  }

  /** repos 全件 (repo_id 昇順)。 */
  listRepos(): Array<{ repoId: number; repoName: string }> {
    const db = this.ensureDb();
    const res = db.exec('SELECT repo_id, repo_name FROM repos ORDER BY repo_id');
    return (res[0]?.values ?? []).map((r) => ({
      repoId: Number(r[0]),
      repoName: asText(r[1] ?? ''),
    }));
  }

  /**
   * repos 全件を Supabase ミラー (trail_repos) へ運ぶ形で返す (repo_id 昇順、created_at 含む)。
   * SyncService が子テーブルより前に upsertRepos へ渡す (FK 親優先)。
   */
  getAllRepos(): Array<{ repo_id: number; repo_name: string; created_at: string | null }> {
    const db = this.ensureDb();
    const res = db.exec('SELECT repo_id, repo_name, created_at FROM repos ORDER BY repo_id');
    return (res[0]?.values ?? []).map((r) => ({
      repo_id: Number(r[0] ?? 0),
      repo_name: asText(r[1] ?? ''),
      created_at: r[2] == null ? null : asText(r[2]),
    }));
  }

  /**
   * 既存テーブルに散在する repo_name を repos へ取り込む (冪等・再実行可能)。
   * seed 後に増えた repo を後追い登録するためにも使う。repo_name='' (sentinel) も取り込む。
   * 戻り値は同期後の repos 件数。
   */
  syncReposFromLegacyRepoNames(): number {
    const db = this.ensureDb();
    this.seedReposFromLegacyRepoNames(db);
    this.backfillReleaseRepoIds(db);
    this.backfillReleaseIds(db);
    this.migrateReleaseChildrenReleaseId(db);
    const res = db.exec('SELECT COUNT(*) FROM repos');
    return Number(res[0]?.values?.[0]?.[0] ?? 0);
  }

  /**
   * tag から releases.release_id を引く (代理キー解決・Phase B-2b-iii flip 後の write/filter 用)。
   * 未知 tag は null。flip 後は子テーブルの FK は release_id なので、tag を受ける外部 API は
   * 必ずこのヘルパで release_id へ変換してから子テーブルへ書き込む / フィルタする。
   */
  private releaseIdForTag(db: Database, tag: string): number | null {
    const res = db.exec('SELECT release_id FROM releases WHERE tag = ? LIMIT 1', [tag]);
    const id = res[0]?.values?.[0]?.[0];
    return id == null ? null : Number(id);
  }

  // Phase B-2b-iii flip 対象の release 子テーブルと、旧スキーマでの FK 列名。
  // release_graphs / release_code_graphs は旧 PK が tag / release_tag だった。
  private static readonly RELEASE_CHILD_FLIP: ReadonlyArray<{ table: string; oldTagCol: string }> = [
    { table: 'release_graphs', oldTagCol: 'tag' },
    { table: 'release_files', oldTagCol: 'release_tag' },
    { table: 'release_coverage', oldTagCol: 'release_tag' },
    { table: 'release_code_graphs', oldTagCol: 'release_tag' },
    { table: 'release_code_graph_communities', oldTagCol: 'release_tag' },
    { table: 'release_file_analysis', oldTagCol: 'release_tag' },
    { table: 'release_function_analysis', oldTagCol: 'release_tag' },
  ];

  /**
   * Phase B-2b-iii flip: 既存 DB の releases を代理キー (release_id PRIMARY KEY) 化し、
   * 子 7 テーブルの FK を tag/release_tag → release_id へ張替える破壊的マイグレーション。
   *
   * `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   * - CREATE_RELEASES 実行前に呼ぶ (CREATE TABLE IF NOT EXISTS は既存テーブルへ無効なため)。
   * - 新規 DB (releases 不在) は no-op。CREATE_* が新スキーマを直接作る。
   * - 既に flip 済 (releases に prev_tag 無し かつ 全子に release_tag/tag 無し) なら no-op (冪等)。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * backfill 済の release_id / repo_id を使うが、念のため migration 内でも release_id を rowid から、
   * 子の release_id を旧 tag 列経由で補完してから新テーブルへ INSERT...SELECT する。
   * prev_release_id は旧 prev_tag → releases.release_id で解決する。
   */
  private migrateReleasesFlip(db: Database): void {
    // releases が無ければ新規 DB。CREATE_* が新スキーマを作るので何もしない。
    const releasesExists =
      db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='releases'")[0]?.values
        ?.length;
    if (!releasesExists) return;

    const releasesNeedsFlip = columnExists(db, 'releases', 'prev_tag');
    const childNeedsFlip = TrailDatabase.RELEASE_CHILD_FLIP.some(
      ({ table, oldTagCol }) =>
        db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
          ?.length && columnExists(db, table, oldTagCol),
    );
    if (!releasesNeedsFlip && !childNeedsFlip) return; // 既に flip 済 (冪等)

    try {
      // ── pre: backfill を保証 (init の additive backfill が未走でも flip 可能にする) ──
      if (releasesNeedsFlip) {
        if (!columnExists(db, 'releases', 'repo_id')) {
          db.run('ALTER TABLE releases ADD COLUMN repo_id INTEGER');
        }
        if (!columnExists(db, 'releases', 'release_id')) {
          db.run('ALTER TABLE releases ADD COLUMN release_id INTEGER');
        }
        db.run('UPDATE releases SET release_id = rowid WHERE release_id IS NULL');
        db.run(
          `UPDATE releases
             SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = releases.repo_name)
           WHERE repo_id IS NULL`,
        );
      }
      this.backfillReleaseChildrenPreFlip(db);

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        // 親 (releases) を先に再構築する。子は FK OFF なので順序依存は無いが、
        // prev_release_id 解決のため新 releases を先に作る。
        if (releasesNeedsFlip) {
          this.rebuildReleasesTableForFlip(db);
        }
        for (const { table, oldTagCol } of TrailDatabase.RELEASE_CHILD_FLIP) {
          const tExists =
            db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
              ?.length;
          if (!tExists) continue;
          if (!columnExists(db, table, oldTagCol)) continue;
          this.rebuildReleaseChildForFlip(db, table);
        }
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[flip]');
      this.save();
    } catch (e) {
      this.logger.error('migrateReleasesFlip failed', e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  /** flip: releases を新スキーマ (release_id PK) へ 12-step 再構築する。 */
  private rebuildReleasesTableForFlip(db: Database): void {
    db.run('DROP TABLE IF EXISTS releases__new');
    db.run(CREATE_RELEASES.replace('CREATE TABLE IF NOT EXISTS releases', 'CREATE TABLE releases__new'));
    // 新スキーマの列のうち、旧テーブルにも存在する列を共有列としてコピーする。
    const newCols = (db.exec('PRAGMA table_info(releases__new)')[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec('PRAGMA table_info(releases)')[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    // prev_release_id は旧 prev_tag → releases.release_id で解決する派生列。
    const sharedCols = newCols.filter((c) => c !== 'prev_release_id' && oldCols.has(c));
    const selectExprs = sharedCols.slice();
    let insertCols = sharedCols.slice();
    if (oldCols.has('prev_tag')) {
      insertCols = [...sharedCols, 'prev_release_id'];
      selectExprs.push(
        '(SELECT p.release_id FROM releases p WHERE p.tag = releases.prev_tag) AS prev_release_id',
      );
    }
    const quotedInsertCols = insertCols.map((c) => `"${c}"`).join(',');
    const quotedSelectExprs = selectExprs.map((e) => (e.includes(' AS ') ? e : `"${e}"`)).join(',');
    db.run(
      `INSERT INTO releases__new (${quotedInsertCols})
       SELECT ${quotedSelectExprs} FROM releases`,
    );
    db.run('DROP TABLE releases');
    db.run('ALTER TABLE releases__new RENAME TO releases');
  }

  /** pre-flip: release 子テーブルに release_id 列を追加して backfill する。 */
  private backfillReleaseChildrenPreFlip(db: Database): void {
    for (const { table, oldTagCol } of TrailDatabase.RELEASE_CHILD_FLIP) {
      const tExists =
        db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
          ?.length;
      if (!tExists) continue;
      if (!columnExists(db, table, oldTagCol)) continue; // 旧列が無い (= 既に flip 済) なら skip
      if (!columnExists(db, table, 'release_id')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN release_id INTEGER`);
      }
      // 旧 tag 列 → releases.release_id で release_id を補完。
      // releases 側が旧スキーマ (release_id 列追加直後) でも上で backfill 済。
      db.run(
        `UPDATE "${table}"
           SET release_id = (SELECT r.release_id FROM releases r WHERE r.tag = "${table}"."${oldTagCol}")
         WHERE release_id IS NULL`,
      );
    }
  }

  /** flip: release 子テーブルを新スキーマ (release_id FK) へ 12-step 再構築する。 */
  private rebuildReleaseChildForFlip(db: Database, table: string): void {
    const ddl = RELEASE_CHILD_DDL[table];
    if (!ddl) {
      this.logger.warn(`[flip] no DDL registered for child table ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const newCols = (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    const sharedCols = newCols.filter((c) => oldCols.has(c));
    // release_id が共有列に含まれない場合は旧 tag 列で解決できなかった (= 不整合) ので abort。
    if (!sharedCols.includes('release_id')) {
      this.logger.warn(`[flip] ${table}: release_id missing after backfill, dropping table to rebuild empty`);
    }
    // release_id IS NULL の行 (旧 tag が releases に無い orphan) は新テーブルの NOT NULL を満たさないため除外。
    const quotedCols2141 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedCols2141})
       SELECT ${quotedCols2141} FROM "${table}" WHERE release_id IS NOT NULL`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  // Phase C-2 flip 対象の current_* テーブル。repo_name を PK に含む 6 つ。
  private static readonly CURRENT_REPO_ID_TABLES: readonly string[] = [
    'current_graphs',
    'current_code_graphs',
    'current_code_graph_communities',
    'current_coverage',
    'current_file_analysis',
    'current_function_analysis',
  ];

  /**
   * Phase C-2 flip: 既存 DB の current_* 6 テーブルを repo_id 代理キー PK へ再構築する破壊的
   * マイグレーション。各テーブルに `repo_id INTEGER NOT NULL` を追加し、PK の repo_name を
   * repo_id へ置換する。repo_name 列は移行互換のため残す (撤去は将来 Phase H)。
   *
   * `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   * - CREATE_CURRENT_* 実行前に呼ぶ (CREATE TABLE IF NOT EXISTS は既存テーブルへ無効なため)。
   * - 新規 DB (テーブル不在) は no-op。CREATE_* が新スキーマを直接作る。
   * - 既に flip 済 (repo_id 列あり) なら no-op (冪等)。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * repo_id は `(SELECT repo_id FROM repos WHERE repos.repo_name = <table>.repo_name)` で
   * backfill する。init() の seedReposFromLegacyRepoNames より前 (createTables 内) に走るため、
   * backfill 前に各テーブルの repo_name を repos へ self-seed しておき、解決可能にする。
   * repo_id が解決できなかった行 (= repos に無い repo_name) は新スキーマの NOT NULL を
   * 満たさないため除外される。
   */
  private migrateCurrentTablesRepoId(db: Database): void {
    // flip が必要なテーブル (存在し、かつ repo_id 列が無い) を洗い出す。
    const tablesToFlip = TrailDatabase.CURRENT_REPO_ID_TABLES.filter((table) => {
      const exists =
        db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
          ?.length;
      if (!exists) return false; // 新規 DB → CREATE_* が新スキーマを作る
      if (columnExists(db, table, 'repo_id')) return false; // 既に flip 済 (冪等)
      // 旧スキーマでも repo_name 列が無い退化 DB (file_analysis 系) は別マイグレーション
      // (migrateFileAnalysisSchema / migrateCurrentGraphsSchema) が DROP して再作成するため対象外。
      return columnExists(db, table, 'repo_name');
    });
    if (tablesToFlip.length === 0) return;

    try {
      // ── pre: repos を self-seed し、repo_id 列を追加して backfill する ──
      for (const table of tablesToFlip) {
        db.run(
          `INSERT OR IGNORE INTO repos (repo_name, created_at)
           SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           FROM "${table}" WHERE repo_name IS NOT NULL`,
        );
        db.run(`ALTER TABLE "${table}" ADD COLUMN repo_id INTEGER`);
        db.run(
          `UPDATE "${table}"
             SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)`,
        );
      }

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        for (const table of tablesToFlip) {
          this.rebuildCurrentTableForRepoIdFlip(db, table);
        }
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[current flip]');
      this.save();
    } catch (e) {
      this.logger.error('migrateCurrentTablesRepoId failed', e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  private recreateViewsAndTriggers(
    db: Database,
    viewDefs: unknown[][],
    triggerDefs: unknown[][],
    logPrefix: string,
  ): void {
    for (const v of viewDefs) {
      try {
        db.run(asText(v[1] ?? ''));
      } catch (e) {
        this.logger.warn(`${logPrefix} recreate view ${asText(v[0] ?? '')}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const t of triggerDefs) {
      try {
        db.run(asText(t[1] ?? ''));
      } catch (e) {
        this.logger.warn(`${logPrefix} recreate trigger ${asText(t[0] ?? '')}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** flip: current_* テーブルを新スキーマ (repo_id PK) へ 12-step 再構築する。 */
  private rebuildCurrentTableForRepoIdFlip(db: Database, table: string): void {
    const ddl = CURRENT_REPO_ID_DDL[table];
    if (!ddl) {
      this.logger.warn(`[current flip] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const newCols = (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    // 新スキーマの列のうち旧テーブルにも存在する列を共有列としてコピーする (repo_id を含む)。
    const sharedCols = newCols.filter((c) => oldCols.has(c));
    // repo_id IS NULL の行 (= repos に無い repo_name の orphan) は新スキーマの NOT NULL を
    // 満たさないため除外する。
    const quotedCols2270 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedCols2270})
       SELECT ${quotedCols2270} FROM "${table}" WHERE repo_id IS NOT NULL`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  // Phase D flip 対象の session/commit 系テーブル。PK が repo_id を含むよう再設計する 3 つ。
  private static readonly SESSION_COMMIT_REPO_ID_TABLES: readonly string[] = [
    'session_commits',
    'commit_files',
    'session_commit_resolutions',
  ];

  /**
   * Phase D flip: 既存 DB の session/commit 系テーブルを repo_id 化する破壊的マイグレーション。
   *
   * - `sessions`: PK は `id` のまま不変。repo_id を additive 追加し backfill するのみ (12-step 不要)。
   * - `session_commits` / `commit_files` / `session_commit_resolutions`: PK を repo_id を含むよう
   *   再設計する (widening)。`~/.claude/rules/sqlite-table-definition.md` の 12-step 再構築に従う。
   *
   * - CREATE_SESSIONS / CREATE_SESSION_COMMITS 等の実行前に呼ぶ (CREATE TABLE IF NOT EXISTS は
   *   既存テーブルへ無効なため)。新規 DB (テーブル不在) は no-op。CREATE_* が新スキーマを直接作る。
   * - 既に flip 済 (repo_id 列あり) なら no-op (冪等)。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * 各テーブルの distinct repo_name を repos へ self-seed (chicken-egg 回避) してから repo_id 列を
   * 追加し、`repo_id = (SELECT repo_id FROM repos WHERE repo_name = <table>.repo_name)` で backfill
   * する (repo_name='' も sentinel repo へ解決される)。旧 PK は新 PK の部分集合または等価なので
   * 既存行は新 PK で衝突しない (widening)。repo_id IS NULL の orphan 行は新 NOT NULL を満たさない
   * ため 12-step 再構築の INSERT...SELECT で除外する。
   */
  private migrateSessionCommitTablesRepoId(db: Database): void {
    // PK 再設計が必要なテーブル (存在し、かつ repo_id 列が無い) を洗い出す。
    const tablesToFlip = TrailDatabase.SESSION_COMMIT_REPO_ID_TABLES.filter((table) => {
      const exists =
        db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
          ?.length;
      if (!exists) return false; // 新規 DB → CREATE_* が新スキーマを作る
      if (columnExists(db, table, 'repo_id')) return false; // 既に flip 済 (冪等)
      // 旧スキーマに repo_name 列が無い退化 DB は backfill 不能だが、self-seed/backfill を
      // repo_name 不在でも安全に行うため対象に含める (repo_id は DEFAULT 0 で埋まる)。
      return true;
    });

    // sessions は PK 不変・additive。repo_id 列が無ければ追加して backfill する (独立処理)。
    this.migrateSessionsRepoIdColumn(db);

    if (tablesToFlip.length === 0) return;

    try {
      // ── pre: repos を self-seed し、repo_id 列を追加して backfill する ──
      for (const table of tablesToFlip) {
        if (columnExists(db, table, 'repo_name')) {
          db.run(
            `INSERT OR IGNORE INTO repos (repo_name, created_at)
             SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             FROM "${table}" WHERE repo_name IS NOT NULL`,
          );
        }
        db.run(`ALTER TABLE "${table}" ADD COLUMN repo_id INTEGER`);
        if (columnExists(db, table, 'repo_name')) {
          db.run(
            `UPDATE "${table}"
               SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)`,
          );
        }
      }

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        for (const table of tablesToFlip) {
          this.rebuildSessionCommitTableForRepoIdFlip(db, table);
        }
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[session-commit flip]');
      this.save();
    } catch (e) {
      this.logger.error('migrateSessionCommitTablesRepoId failed', e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  /**
   * sessions に repo_id 列が無ければ ALTER ADD COLUMN で追加し backfill する (Phase D・additive)。
   * sessions は PK が `id` のため 12-step 再構築は不要。SQLite の ALTER ADD COLUMN は default 無しの
   * NOT NULL を追加できないため、repo_id は nullable で追加し repo_name → repos で backfill する。
   * 新規 DB は CREATE_SESSIONS に repo_id を含むため no-op。FK は init で off のため REFERENCES は付けない。
   */
  private migrateSessionsRepoIdColumn(db: Database): void {
    const exists =
      db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'")[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_SESSIONS が新スキーマを作る
    try {
      if (!columnExists(db, 'sessions', 'repo_id')) {
        db.run('ALTER TABLE sessions ADD COLUMN repo_id INTEGER');
      }
      // repo_name を repos へ self-seed してから backfill する (chicken-egg 回避)。
      db.run(
        `INSERT OR IGNORE INTO repos (repo_name, created_at)
         SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM sessions WHERE repo_name IS NOT NULL`,
      );
      db.run(
        `UPDATE sessions
           SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = sessions.repo_name)
         WHERE repo_id IS NULL`,
      );
    } catch (e) {
      this.logger.warn(
        `[sessions repo_id migrate] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** flip: session/commit 系テーブルを新スキーマ (repo_id PK) へ 12-step 再構築する。 */
  private rebuildSessionCommitTableForRepoIdFlip(db: Database, table: string): void {
    const ddl = SESSION_COMMIT_REPO_ID_DDL[table];
    if (!ddl) {
      this.logger.warn(`[session-commit flip] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const newCols = (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    // 新スキーマの列のうち旧テーブルにも存在する列を共有列としてコピーする (repo_id を含む)。
    const sharedCols = newCols.filter((c) => oldCols.has(c));
    // repo_id IS NULL の行 (= repos に無い repo_name の orphan) は新スキーマの NOT NULL を
    // 満たさないため除外する。旧 PK は新 PK の部分集合/等価のため残った行は新 PK で衝突しない。
    const quotedCols2436 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedCols2436})
       SELECT ${quotedCols2436} FROM "${table}" WHERE repo_id IS NOT NULL`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  // Phase E flip 対象の c4_manual 系テーブル。PK / 複合 FK を repo_id ベースへ再設計する 3 つ。
  // 親 (c4_manual_elements) を先頭に置く: 12-step 再構築は親→子の順で回す (複合 FK 解決のため。
  // FK は init で OFF のため runtime 強制はされないが、意図を明示する)。
  private static readonly C4_MANUAL_REPO_ID_TABLES: readonly string[] = [
    'c4_manual_elements',
    'c4_manual_relationships',
    'c4_manual_groups',
  ];

  /**
   * Phase E flip: 既存 DB の c4_manual 系 3 テーブルを repo_id 代理キー PK + 複合 FK へ
   * 再設計する破壊的マイグレーション。
   *
   * - `c4_manual_elements`: PK `(repo_name, element_id)` → `(repo_id, element_id)`、自己参照複合 FK
   *   `(repo_name, parent_id)` → `(repo_id, parent_id) → c4_manual_elements(repo_id, element_id)`。
   * - `c4_manual_relationships`: PK `(repo_name, rel_id)` → `(repo_id, rel_id)`、複合 FK
   *   `(repo_id, from_id)` / `(repo_id, to_id) → c4_manual_elements(repo_id, element_id)`。
   * - `c4_manual_groups`: PK `(repo_name, group_id)` → `(repo_id, group_id)`。
   *
   * `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   * - CREATE_C4_MANUAL_* の実行前に呼ぶ (CREATE TABLE IF NOT EXISTS は既存テーブルへ無効なため)。
   * - 新規 DB (テーブル不在) は no-op。CREATE_* が新スキーマを直接作る。
   * - 既に flip 済 (repo_id 列あり) なら no-op (冪等)。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * chicken-egg 回避: 各テーブルの distinct repo_name を `INSERT OR IGNORE INTO repos` で self-seed
   * してから repo_id 列を追加し、`repo_id = (SELECT repo_id FROM repos WHERE repo_name = <table>.repo_name)`
   * で backfill する (repo_name='' も sentinel repo へ解決される)。repo_id IS NULL の orphan 行は新
   * NOT NULL を満たさないため 12-step 再構築の INSERT...SELECT で除外する。親 (elements) を先に再構築する。
   */
  private migrateC4ManualTablesRepoId(db: Database): void {
    // PK / FK 再設計が必要なテーブル (存在し、かつ repo_id 列が無い) を洗い出す。
    const tablesToFlip = TrailDatabase.C4_MANUAL_REPO_ID_TABLES.filter((table) => {
      const exists =
        db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
          ?.length;
      if (!exists) return false; // 新規 DB → CREATE_* が新スキーマを作る
      if (columnExists(db, table, 'repo_id')) return false; // 既に flip 済 (冪等)
      // 旧スキーマには必ず repo_name 列がある (旧 PK 構成列)。退化 DB の防御は backfill の
      // columnExists ガードで吸収する。
      return true;
    });
    if (tablesToFlip.length === 0) return;

    try {
      // ── pre: repos を self-seed し、repo_id 列を追加して backfill する ──
      for (const table of tablesToFlip) {
        if (columnExists(db, table, 'repo_name')) {
          db.run(
            `INSERT OR IGNORE INTO repos (repo_name, created_at)
             SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             FROM "${table}" WHERE repo_name IS NOT NULL`,
          );
        }
        db.run(`ALTER TABLE "${table}" ADD COLUMN repo_id INTEGER`);
        if (columnExists(db, table, 'repo_name')) {
          db.run(
            `UPDATE "${table}"
               SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)`,
          );
        }
      }

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        // 親 (c4_manual_elements) → 子 (relationships / groups) の順で再構築する
        // (複合 FK 解決のため。C4_MANUAL_REPO_ID_TABLES の宣言順がこの順序)。
        for (const table of TrailDatabase.C4_MANUAL_REPO_ID_TABLES) {
          if (!tablesToFlip.includes(table)) continue;
          this.rebuildC4ManualTableForRepoIdFlip(db, table);
        }
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[c4-manual flip]');
      this.save();
    } catch (e) {
      this.logger.error('migrateC4ManualTablesRepoId failed', e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  /** flip: c4_manual 系テーブルを新スキーマ (repo_id PK + 複合 FK) へ 12-step 再構築する。 */
  private rebuildC4ManualTableForRepoIdFlip(db: Database, table: string): void {
    const ddl = C4_MANUAL_REPO_ID_DDL[table];
    if (!ddl) {
      this.logger.warn(`[c4-manual flip] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const newCols = (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    // 新スキーマの列のうち旧テーブルにも存在する列を共有列としてコピーする (repo_id を含む)。
    const sharedCols = newCols.filter((c) => oldCols.has(c));
    // repo_id IS NULL の行 (= repos に無い repo_name の orphan) は新スキーマの NOT NULL を
    // 満たさないため除外する。旧 PK (repo_name, <id>) は新 PK (repo_id, <id>) と 1:1 対応のため
    // 残った行は新 PK で衝突しない。
    const quotedCols2576 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedCols2576})
       SELECT ${quotedCols2576} FROM "${table}" WHERE repo_id IS NOT NULL`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  /**
   * Phase H-2: c4_manual 系 3 テーブル (c4_manual_elements / c4_manual_relationships /
   * c4_manual_groups) から非正規化キャッシュの repo_name 列を物理撤去する (冪等)。
   * `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   *
   * - 各テーブルに repo_name 列が在る時のみ実行する (`columnExists` ガードで冪等)。
   * - 撤去前に repo_name から repos を self-seed し、未解決の repo_id を backfill する (Phase E flip が
   *   既に repo_id を埋めている前提だが、退化 DB 防御のため再実行する)。
   * - 新スキーマ (repo_name を持たない CREATE_C4_MANUAL_* DDL) へ INSERT...SELECT で共有列をコピーする。
   *   repo_name 列は新スキーマに無いため自然に落ちる。複合 PK (repo_id, <id>)・複合 FK
   *   (repo_id, parent_id/from_id/to_id)・CHECK・STRICT は repo_id 構成のため不変。
   * - CREATE_C4_MANUAL_* (CREATE TABLE IF NOT EXISTS) の実行前に呼ぶ。新規 DB / 撤去済 DB は no-op。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *   FK OFF のため再構築順は影響しないが、Phase E と同じ親 (elements) → 子 (relationships / groups)
   *   の順で回し、意図を明示する。
   *
   * 撤去後、repo フィルタは repo_id = ? (repoIdForName 解決) で行う。c4_manual の read メソッドは
   * repo_name を結果に含めない (repoName を入力に取り repo_id で絞り込む契約) ため、下流契約は不変。
   */
  private migrateDropC4ManualRepoName(db: Database): void {
    for (const table of TrailDatabase.C4_MANUAL_REPO_ID_TABLES) {
      this.dropC4ManualRepoNameColumn(db, table);
    }
  }

  /** Phase H-2: 1 テーブルから repo_name 列を 12-step 再構築で物理撤去する (冪等)。 */
  private dropC4ManualRepoNameColumn(db: Database, table: string): void {
    const exists =
      db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_C4_MANUAL_* が新スキーマ (repo_name なし) を作る
    if (!columnExists(db, table, 'repo_name')) return; // 既に撤去済 (冪等)
    if (!columnExists(db, table, 'repo_id')) {
      // repo_id が無い退化 DB は H-2 の対象外 (Phase E flip が先に repo_id PK を入れる想定)。
      this.logger.warn(`[c4-manual drop repo_name] ${table} has no repo_id, skip drop`);
      return;
    }

    try {
      // ── pre: repo_name から repos を self-seed し、未解決 repo_id を backfill する (防御的) ──
      db.run(
        `INSERT OR IGNORE INTO repos (repo_name, created_at)
         SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM "${table}" WHERE repo_name IS NOT NULL`,
      );
      db.run(
        `UPDATE "${table}"
           SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)
         WHERE repo_id IS NULL
           AND (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name) IS NOT NULL`,
      );

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        this.rebuildC4ManualTableDroppingRepoName(db, table);
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[c4-manual drop repo_name]');
      this.save();
    } catch (e) {
      this.logger.error(
        `dropC4ManualRepoNameColumn(${table}) failed`,
        e instanceof Error ? e : new Error(String(e)),
      );
      throw e;
    }
  }

  /** flip: c4_manual 系テーブルを新スキーマ (repo_name なし・複合 PK/FK 維持) へ 12-step 再構築する。 */
  private rebuildC4ManualTableDroppingRepoName(db: Database, table: string): void {
    const ddl = C4_MANUAL_DROP_REPO_NAME_DDL[table];
    if (!ddl) {
      this.logger.warn(`[c4-manual drop repo_name] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const newCols = (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    // 新スキーマの列のうち旧テーブルにも存在する列を共有列としてコピーする。新スキーマには
    // repo_name が無いため共有列に repo_name は含まれず自然に落ちる。repo_id・element_id 等の
    // 複合 PK/FK 構成列は両者に在るためコピーされ、PK/FK の整合は維持される。
    const sharedCols = newCols.filter((c) => oldCols.has(c));
    const quotedCols2705 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedCols2705})
       SELECT ${quotedCols2705} FROM "${table}"`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  /**
   * Phase H-3: current 系 6 テーブル (current_graphs / current_code_graphs /
   * current_code_graph_communities / current_coverage / current_file_analysis /
   * current_function_analysis) から非正規化キャッシュの repo_name 列を物理撤去する (冪等)。
   * `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   *
   * - 各テーブルに repo_name 列が在る時のみ実行する (`columnExists` ガードで冪等)。
   * - 撤去前に repo_name から repos を self-seed し、未解決の repo_id を backfill する (Phase C-2 flip が
   *   既に repo_id を埋めている前提だが、退化 DB 防御のため再実行する)。
   * - 新スキーマ (repo_name を持たない CREATE_CURRENT_* DDL) へ INSERT...SELECT で共有列をコピーする。
   *   repo_name 列は新スキーマに無いため自然に落ちる。PK / FK / CHECK / STRICT は repo_id 構成のため不変。
   *   ALTER 由来で静的 DDL に無い列 (mappings_json) は再構築時に保全する
   *   (rebuildCurrentTableDroppingRepoName 参照)。current_code_graph_communities の stable_key
   *   列・部分索引も維持する。
   * - CREATE_CURRENT_* (CREATE TABLE IF NOT EXISTS) の実行前に呼ぶ。新規 DB / 撤去済 DB は no-op。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * 撤去後、repo フィルタは repo_id = ? (repoIdForName 解決) で行う。repo_name が必要な read メソッドは
   * JOIN repos USING(repo_id) で r.repo_name を射影し、結果行のキー名 repo_name を維持する (下流契約は不変)。
   */
  private migrateDropCurrentRepoName(db: Database): void {
    for (const table of TrailDatabase.CURRENT_REPO_ID_TABLES) {
      this.dropCurrentRepoNameColumn(db, table);
    }
  }

  /** Phase H-3: 1 テーブルから repo_name 列を 12-step 再構築で物理撤去する (冪等)。 */
  private dropCurrentRepoNameColumn(db: Database, table: string): void {
    const exists =
      db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_CURRENT_* が新スキーマ (repo_name なし) を作る
    if (!columnExists(db, table, 'repo_name')) return; // 既に撤去済 (冪等)
    if (!columnExists(db, table, 'repo_id')) {
      // repo_id が無い退化 DB は H-3 の対象外 (Phase C-2 flip が先に repo_id PK を入れる想定)。
      this.logger.warn(`[current drop repo_name] ${table} has no repo_id, skip drop`);
      return;
    }

    try {
      // ── pre: repo_name から repos を self-seed し、未解決 repo_id を backfill する (防御的) ──
      db.run(
        `INSERT OR IGNORE INTO repos (repo_name, created_at)
         SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM "${table}" WHERE repo_name IS NOT NULL`,
      );
      db.run(
        `UPDATE "${table}"
           SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)
         WHERE repo_id IS NULL
           AND (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name) IS NOT NULL`,
      );

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        this.rebuildCurrentTableDroppingRepoName(db, table);
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[current drop repo_name]');
      this.save();
    } catch (e) {
      this.logger.error(
        `dropCurrentRepoNameColumn(${table}) failed`,
        e instanceof Error ? e : new Error(String(e)),
      );
      throw e;
    }
  }

  /**
   * flip: current 系テーブルを新スキーマ (repo_name なし) へ 12-step 再構築する。
   *
   * 静的 DDL に無い ALTER 由来の列 (例: current_code_graph_communities.mappings_json) は、
   * repo_name 撤去だけが目的なので保全する必要がある。`__new` を静的 DDL で作った後、旧テーブルに在って
   * `__new` に無い列 (repo_name を除く) を `__new` へ ALTER ADD COLUMN で復元してから共有列をコピーする。
   * これにより repo_name のみが落ち、mappings_json 等は値ごと引き継がれる。
   */
  private rebuildCurrentTableDroppingRepoName(db: Database, table: string): void {
    const ddl = CURRENT_DROP_REPO_NAME_DDL[table];
    if (!ddl) {
      this.logger.warn(`[current drop repo_name] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const oldCols = (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const newColSet = new Set(
      (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
        asText(c[1] ?? ''),
      ),
    );
    // 静的 DDL に無い ALTER 由来の列 (repo_name 以外) を `__new` へ復元する。mappings_json は当初の
    // スキーマに無く後追い ALTER で追加された経緯があり、ここで落とすと AI 後処理の成果物が失われる。
    // ALTER ADD COLUMN は NOT NULL + DEFAULT 無しを付けられないため nullable TEXT として復元する
    // (mappings_json は nullable TEXT・他の想定外列も同様に保守的に扱う)。
    for (const col of oldCols) {
      if (col === 'repo_name') continue;
      if (newColSet.has(col)) continue;
      db.run(`ALTER TABLE "${table}__new" ADD COLUMN "${col}" TEXT`);
      newColSet.add(col);
    }
    // 旧テーブルの列のうち `__new` にも存在する列を共有列としてコピーする。新スキーマ + 復元列には
    // repo_name が無いため共有列に repo_name は含まれず自然に落ちる。repo_id を含む PK 構成列・
    // mappings_json 等は両者に在るためコピーされ、整合は維持される。
    const sharedCols = oldCols.filter((c) => newColSet.has(c) && c !== 'repo_name');
    const quotedColsH3 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedColsH3})
       SELECT ${quotedColsH3} FROM "${table}"`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  // Phase H-4 flip 対象の session/commit 系 4 テーブル。子 (session_commits / commit_files /
  // session_commit_resolutions) を sessions より先に再構築する: sessions__new RENAME 時点で子の FK
  // 参照先が壊れないようにする (FK は init で OFF のため runtime 強制はされないが意図を明示する)。
  private static readonly SESSION_COMMIT_REPO_NAME_TABLES: readonly string[] = [
    'session_commits',
    'commit_files',
    'session_commit_resolutions',
    'sessions',
  ];

  /**
   * Phase H-4: session/commit 系 4 テーブル (sessions / session_commits / commit_files /
   * session_commit_resolutions) から非正規化キャッシュの repo_name 列を物理撤去する (冪等)。
   * `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   *
   * - 各テーブルに repo_name 列が在る時のみ実行する (`columnExists` ガードで冪等)。
   * - 撤去前に repo_name から repos を self-seed し、未解決の repo_id を backfill する (Phase D flip /
   *   additive が既に repo_id を埋めている前提だが、退化 DB 防御のため再実行する)。sessions は
   *   repo_id が nullable のため未解決行は NULL のまま残し、後続 importSession で解決される。
   * - 新スキーマ (repo_name を持たない CREATE_* DDL) へ INSERT...SELECT で共有列をコピーする。
   *   repo_name 列は新スキーマに無いため自然に落ちる。複合 PK / FK は repo_id 構成のため不変。
   *   静的 DDL に無い ALTER 由来の列 (sessions の compact_count 等) は宣言型を保ったまま `__new` へ
   *   復元してから copy する (rebuildSessionCommitTableDroppingRepoName 参照)。
   * - CREATE_SESSIONS / CREATE_SESSION_COMMITS 等 (CREATE TABLE IF NOT EXISTS) の実行前に呼ぶ。
   *   新規 DB / 撤去済 DB は no-op。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * 撤去後、repo フィルタは repo_id = ? (repoIdForName 解決) で行う。repo_name が必要な read メソッド
   * (SyncService の getSessions / getSessionCommits / getCommitFiles 経由で Supabase ミラーへ運ぶもの
   * を含む) は (LEFT) JOIN repos USING(repo_id) で r.repo_name を射影し、結果行のキー名 repo_name を
   * 維持する (下流契約・Supabase trail_* ミラーは不変)。repo_id=0 sentinel など repos に未解決の行は
   * LEFT JOIN + COALESCE(r.repo_name, '') で '' に落とす (旧 repo_name='' と等価)。
   */
  private migrateDropSessionCommitRepoName(db: Database): void {
    for (const table of TrailDatabase.SESSION_COMMIT_REPO_NAME_TABLES) {
      this.dropSessionCommitRepoNameColumn(db, table);
    }
  }

  /** Phase H-4: 1 テーブルから repo_name 列を 12-step 再構築で物理撤去する (冪等)。 */
  private dropSessionCommitRepoNameColumn(db: Database, table: string): void {
    const exists =
      db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_* が新スキーマ (repo_name なし) を作る
    if (!columnExists(db, table, 'repo_name')) return; // 既に撤去済 (冪等)
    if (!columnExists(db, table, 'repo_id')) {
      // repo_id が無い退化 DB は H-4 の対象外 (Phase D flip/additive が先に repo_id を入れる想定)。
      this.logger.warn(`[session-commit drop repo_name] ${table} has no repo_id, skip drop`);
      return;
    }

    try {
      // ── pre: repo_name から repos を self-seed し、未解決 repo_id を backfill する (防御的) ──
      // sessions は repo_id nullable のため repo_id IS NULL の行も解決を試みる。子テーブルは repo_id
      // NOT NULL (DEFAULT 0 sentinel) のため repos に解決できる行のみ更新し、未解決行は sentinel を残す。
      db.run(
        `INSERT OR IGNORE INTO repos (repo_name, created_at)
         SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM "${table}" WHERE repo_name IS NOT NULL AND repo_name <> ''`,
      );
      if (table === 'sessions') {
        db.run(
          `UPDATE "${table}"
             SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)
           WHERE repo_id IS NULL
             AND (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name) IS NOT NULL`,
        );
      } else {
        db.run(
          `UPDATE "${table}"
             SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)
           WHERE (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name) IS NOT NULL`,
        );
      }

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        this.rebuildSessionCommitTableDroppingRepoName(db, table);
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[session-commit drop repo_name]');
      this.save();
    } catch (e) {
      this.logger.error(
        `dropSessionCommitRepoNameColumn(${table}) failed`,
        e instanceof Error ? e : new Error(String(e)),
      );
      throw e;
    }
  }

  /**
   * flip: session/commit 系テーブルを新スキーマ (repo_name なし) へ 12-step 再構築する。
   *
   * 静的 DDL (CREATE_SESSIONS 等) に無い ALTER 由来の列 (例: sessions.compact_count・将来追加分) は
   * repo_name 撤去だけが目的なので保全する必要がある。`__new` を静的 DDL で作った後、旧テーブルに在って
   * `__new` に無い列 (repo_name を除く) を旧テーブルの宣言型を保ったまま `__new` へ ALTER ADD COLUMN で
   * 復元してから共有列をコピーする。STRICT のため宣言型が空/不明な列は TEXT へフォールバックする。
   * これにより repo_name のみが落ち、ALTER 由来の列は値ごと引き継がれる。複合 PK / FK は不変。
   */
  private rebuildSessionCommitTableDroppingRepoName(db: Database, table: string): void {
    const ddl = SESSION_COMMIT_DROP_REPO_NAME_DDL[table];
    if (!ddl) {
      this.logger.warn(`[session-commit drop repo_name] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    // 旧テーブルの (列名 → 宣言型) を取得する。STRICT で復元できる型へ正規化する。
    const oldColInfo = (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => ({
      name: asText(c[1] ?? ''),
      declType: asText(c[2] ?? '').toUpperCase(),
    }));
    const oldCols = oldColInfo.map((c) => c.name);
    const newColSet = new Set(
      (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
        asText(c[1] ?? ''),
      ),
    );
    // 静的 DDL に無い ALTER 由来の列 (repo_name 以外) を旧宣言型で `__new` へ復元する。STRICT が
    // 受理する型 (INT / INTEGER / REAL / TEXT / BLOB / ANY) のみ採用し、それ以外は TEXT へ寄せる。
    // ALTER ADD COLUMN は NOT NULL + DEFAULT 無しを付けられないため nullable のまま追加する。
    const strictTypes = new Set(['INT', 'INTEGER', 'REAL', 'TEXT', 'BLOB', 'ANY']);
    for (const { name, declType } of oldColInfo) {
      if (name === 'repo_name') continue;
      if (newColSet.has(name)) continue;
      const restoreType = strictTypes.has(declType) ? declType : 'TEXT';
      db.run(`ALTER TABLE "${table}__new" ADD COLUMN "${name}" ${restoreType}`);
      newColSet.add(name);
    }
    // 旧テーブルの列のうち `__new` にも存在する列を共有列としてコピーする。新スキーマ + 復元列には
    // repo_name が無いため共有列に repo_name は含まれず自然に落ちる。repo_id を含む PK 構成列はコピーされ
    // 整合は維持される。
    const sharedCols = oldCols.filter((c) => newColSet.has(c) && c !== 'repo_name');
    const quotedColsH4 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedColsH4})
       SELECT ${quotedColsH4} FROM "${table}"`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  // Phase H-5 flip 対象の releases サブツリー 3 テーブル。子 (release_file_analysis /
  // release_function_analysis) を親 (releases) より先に再構築する: releases__new RENAME 時点で子の
  // FK 参照先が壊れないようにする (FK は init で OFF のため runtime 強制はされないが意図を明示する)。
  private static readonly RELEASE_SUBTREE_REPO_NAME_TABLES: readonly string[] = [
    'release_file_analysis',
    'release_function_analysis',
    'releases',
  ];

  /**
   * Phase H-5: releases サブツリー 3 テーブル (releases / release_file_analysis /
   * release_function_analysis) から非正規化キャッシュの repo_name 列を物理撤去する (冪等)。
   * `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   *
   * - 各テーブルに repo_name 列が在る時のみ実行する (`columnExists` ガードで冪等)。
   * - 撤去前に repo_name から repos を self-seed する。releases.repo_id が未解決の行は repo_name から
   *   backfill する (Phase B-2b-iii flip / additive backfill が既に repo_id を埋めている前提だが、退化 DB
   *   防御のため再実行する)。release_*_analysis は repo_id 列を持たず release_id FK で repo 帰属を表すため、
   *   repo_id の backfill は releases 側のみ行う (repos の self-seed は子テーブルの repo_name からも行う)。
   * - 新スキーマ (repo_name を持たない CREATE_RELEASES / CREATE_RELEASE_*_ANALYSIS DDL) へ
   *   INSERT...SELECT で共有列をコピーする。repo_name 列は新スキーマに無いため自然に落ちる。
   *   release_*_analysis は PK から repo_name を除いた形 (release_id が (repo, tag) を一意に決めるため
   *   重複は生じない)。静的 DDL に無い ALTER 由来の列 (release_file_analysis の cross_pkg_in_count 等は
   *   静的 DDL に含むため通常該当しないが、想定外列の保全のため) は宣言型を保ったまま `__new` へ復元してから
   *   copy する (rebuildReleaseSubtreeTableDroppingRepoName 参照)。
   * - CREATE_RELEASES / CREATE_RELEASE_FILE_ANALYSIS / CREATE_RELEASE_FUNCTION_ANALYSIS の実行前に呼ぶ。
   *   新規 DB / 撤去済 DB は no-op。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * 撤去後、release_*_analysis の repo フィルタは release_id (releaseIdForTag 解決) で行う。repo_name が
   * 必要な read メソッド (SyncService の getReleases / getAllReleaseFileAnalysis /
   * getAllReleaseFunctionAnalysis 経由で Supabase trail_releases / trail_release_*_analysis ミラーへ運ぶ
   * ものを含む) は releases→repos JOIN で r.repo_name を、release 行は release_id→releases.tag を
   * 射影し、結果行のキー名 (repo_name / release_tag) を維持する (下流契約・Supabase ミラーは不変)。
   * repo_id=0 sentinel など repos に未解決の releases 行は LEFT JOIN + COALESCE(r.repo_name, '') で
   * '' に落とす (旧 repo_name='' と等価)。
   */
  private migrateDropReleaseSubtreeRepoName(db: Database): void {
    for (const table of TrailDatabase.RELEASE_SUBTREE_REPO_NAME_TABLES) {
      this.dropReleaseSubtreeRepoNameColumn(db, table);
    }
  }

  /** Phase H-5: 1 テーブルから repo_name 列を 12-step 再構築で物理撤去する (冪等)。 */
  private dropReleaseSubtreeRepoNameColumn(db: Database, table: string): void {
    const exists =
      db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_* が新スキーマ (repo_name なし) を作る
    if (!columnExists(db, table, 'repo_name')) return; // 既に撤去済 (冪等)

    try {
      // ── pre: repo_name から repos を self-seed する (防御的) ──
      db.run(
        `INSERT OR IGNORE INTO repos (repo_name, created_at)
         SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM "${table}" WHERE repo_name IS NOT NULL AND repo_name <> ''`,
      );
      // releases のみ repo_id 列を持つ。未解決 repo_id を repo_name から backfill する。
      // release_*_analysis は repo_id 列を持たず release_id FK で repo 帰属を表すため backfill 不要。
      if (table === 'releases' && columnExists(db, table, 'repo_id')) {
        db.run(
          `UPDATE releases
             SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = releases.repo_name)
           WHERE repo_id IS NULL
             AND (SELECT repo_id FROM repos WHERE repos.repo_name = releases.repo_name) IS NOT NULL`,
        );
      }

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        this.rebuildReleaseSubtreeTableDroppingRepoName(db, table);
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[release-subtree drop repo_name]');
      this.save();
    } catch (e) {
      this.logger.error(
        `dropReleaseSubtreeRepoNameColumn(${table}) failed`,
        e instanceof Error ? e : new Error(String(e)),
      );
      throw e;
    }
  }

  /**
   * flip: releases サブツリーのテーブルを新スキーマ (repo_name なし) へ 12-step 再構築する。
   *
   * release_*_analysis は PK 構成列から repo_name を除く (新 PK は (release_id, file_path[, function_name,
   * start_line]))。release_id が (repo, tag) を一意に決めるため、repo_name を PK から除いても
   * (release_id, file_path[, ...]) の重複は生じない (理論上一意・migration 後の row 数で検証)。
   * 静的 DDL (CREATE_RELEASES 等) に無い ALTER 由来の想定外列 (repo_name を除く) は宣言型を保ったまま
   * `__new` へ ALTER ADD COLUMN で復元してから共有列をコピーする。STRICT のため宣言型が空/不明な列は
   * TEXT へフォールバックする。これにより repo_name のみが落ち、他の列は値ごと引き継がれる。
   * releases は PK が release_id 単独 (repo_name は非 PK) のため PK 不変・additive 撤去。
   */
  private rebuildReleaseSubtreeTableDroppingRepoName(db: Database, table: string): void {
    const ddl = RELEASE_SUBTREE_DROP_REPO_NAME_DDL[table];
    if (!ddl) {
      this.logger.warn(`[release-subtree drop repo_name] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    // 旧テーブルの (列名 → 宣言型) を取得する。STRICT で復元できる型へ正規化する。
    const oldColInfo = (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => ({
      name: asText(c[1] ?? ''),
      declType: asText(c[2] ?? '').toUpperCase(),
    }));
    const oldCols = oldColInfo.map((c) => c.name);
    const newColSet = new Set(
      (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
        asText(c[1] ?? ''),
      ),
    );
    // 静的 DDL に無い ALTER 由来の列 (repo_name 以外) を旧宣言型で `__new` へ復元する。STRICT が受理する型
    // (INT / INTEGER / REAL / TEXT / BLOB / ANY) のみ採用し、それ以外は TEXT へ寄せる。ALTER ADD COLUMN は
    // NOT NULL + DEFAULT 無しを付けられないため nullable のまま追加する。
    const strictTypes = new Set(['INT', 'INTEGER', 'REAL', 'TEXT', 'BLOB', 'ANY']);
    for (const { name, declType } of oldColInfo) {
      if (name === 'repo_name') continue;
      if (newColSet.has(name)) continue;
      const restoreType = strictTypes.has(declType) ? declType : 'TEXT';
      db.run(`ALTER TABLE "${table}__new" ADD COLUMN "${name}" ${restoreType}`);
      newColSet.add(name);
    }
    // 旧テーブルの列のうち `__new` にも存在する列を共有列としてコピーする。新スキーマ + 復元列には
    // repo_name が無いため共有列に repo_name は含まれず自然に落ちる。release_id を含む PK 構成列はコピーされ
    // 整合は維持される。release_*_analysis は INSERT OR IGNORE で、新 PK 衝突 (理論上発生しない) 時も
    // 例外を投げずに先勝ちで取り込む。
    const sharedCols = oldCols.filter((c) => newColSet.has(c) && c !== 'repo_name');
    const insertVerb = table === 'releases' ? 'INSERT' : 'INSERT OR IGNORE';
    const quotedColsH5 = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `${insertVerb} INTO "${table}__new" (${quotedColsH5})
       SELECT ${quotedColsH5} FROM "${table}"`,
    );
    // INSERT OR IGNORE は新 PK (repo_name を除いた構成) の衝突行を黙って drop する。万一 release_id が
    // 複数 repo に対応していると行が落ちるため、コピー元と __new の行数を比較し、不足があれば error ログ
    // を出す (サイレントにしない)。migration 自体は止めない (INSERT OR IGNORE 維持)。
    if (insertVerb === 'INSERT OR IGNORE') {
      const srcCount = Number(db.exec(`SELECT COUNT(*) FROM "${table}"`)[0]?.values?.[0]?.[0] ?? 0);
      const newCount = Number(db.exec(`SELECT COUNT(*) FROM "${table}__new"`)[0]?.values?.[0]?.[0] ?? 0);
      if (newCount < srcCount) {
        this.logger.error(
          `[release-subtree drop repo_name] ${table}: PK collision により ${srcCount - newCount} 行 drop ` +
            `(src=${srcCount}, new=${newCount})。release_id が複数 repo に対応している可能性がある`,
        );
      }
    }
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  /**
   * Phase F flip: 既存 DB の derived テーブル (dora_metrics / pr_reviews /
   * cross_source_correlations) を repo_id 化する破壊的/additive マイグレーション。
   *
   * - `dora_metrics`: PK を `(repo_name, period)` → `(repo_id, period)` へ再設計する。
   *   `~/.claude/rules/sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   * - `pr_reviews`: PK は `review_id` 単独のまま不変。repo_id を additive 追加し backfill する
   *   のみ (12-step 不要)。旧 repo フィルタ索引 idx_pr_reviews_repo_pr を repo_id 先頭へ張替える。
   * - `cross_source_correlations`: PK は `(correlation_type, source_a_id, source_b_id)` のまま不変。
   *   repo_id (NULL-able) を additive 追加し backfill する。旧 repo フィルタ索引を張替える。
   *
   * - CREATE_DORA_METRICS / CREATE_PR_REVIEWS 等の実行前に呼ぶ (CREATE TABLE IF NOT EXISTS は
   *   既存テーブルへ無効なため)。新規 DB (テーブル不在) は no-op。CREATE_* が新スキーマを直接作る。
   * - 既に flip 済 (repo_id 列あり) なら no-op (冪等)。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * chicken-egg 回避: 各テーブルの distinct repo_name を `INSERT OR IGNORE INTO repos` で
   * self-seed してから repo_id 列を追加し、`repo_id = (SELECT repo_id FROM repos WHERE
   * repo_name = <table>.repo_name)` で backfill する (repo_name='' も sentinel repo へ解決される)。
   * dora_metrics の NOT NULL repo_id で IS NULL の orphan 行は 12-step 再構築の INSERT...SELECT で
   * 除外する (通常発生しない)。
   */
  private migrateDerivedTablesRepoId(db: Database): void {
    // ── dora_metrics: PK 再設計 (12-step) ──
    this.migrateDoraMetricsRepoIdFlip(db);
    // ── pr_reviews / cross_source_correlations: additive (repo_id 追加 + backfill + 索引張替) ──
    this.migrateDerivedAdditiveRepoIdColumn(db, {
      table: 'pr_reviews',
      repoIdNotNull: true,
      oldIndex: 'idx_pr_reviews_repo_pr',
    });
    this.migrateDerivedAdditiveRepoIdColumn(db, {
      table: 'cross_source_correlations',
      repoIdNotNull: false,
      oldIndex: 'idx_cross_source_correlations_repo',
    });
  }

  /** Phase F flip: dora_metrics を新スキーマ (repo_id PK) へ 12-step 再構築する (冪等)。 */
  private migrateDoraMetricsRepoIdFlip(db: Database): void {
    const exists =
      db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dora_metrics'")[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_DORA_METRICS が新スキーマを作る
    if (columnExists(db, 'dora_metrics', 'repo_id')) return; // 既に flip 済 (冪等)
    if (!columnExists(db, 'dora_metrics', 'repo_name')) return; // 退化 DB は対象外

    try {
      // ── pre: repos を self-seed し、repo_id 列を追加して backfill する ──
      db.run(
        `INSERT OR IGNORE INTO repos (repo_name, created_at)
         SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM dora_metrics WHERE repo_name IS NOT NULL`,
      );
      db.run('ALTER TABLE dora_metrics ADD COLUMN repo_id INTEGER');
      db.run(
        `UPDATE dora_metrics
           SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = dora_metrics.repo_name)`,
      );

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        this.rebuildDerivedTableForRepoIdFlip(db, 'dora_metrics');
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[derived flip]');
      this.save();
    } catch (e) {
      this.logger.error('migrateDoraMetricsRepoIdFlip failed', e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  /** flip: derived テーブルを新スキーマ (repo_id PK) へ 12-step 再構築する。 */
  private rebuildDerivedTableForRepoIdFlip(db: Database, table: string): void {
    const ddl = DERIVED_REPO_ID_DDL[table];
    if (!ddl) {
      this.logger.warn(`[derived flip] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const newCols = (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    // 新スキーマの列のうち旧テーブルにも存在する列を共有列としてコピーする (repo_id を含む)。
    const sharedCols = newCols.filter((c) => oldCols.has(c));
    // repo_id IS NULL の行 (= repos に無い repo_name の orphan) は新スキーマの NOT NULL を
    // 満たさないため除外する。旧 PK (repo_name, period) は新 PK (repo_id, period) と 1:1 対応のため
    // 残った行は新 PK で衝突しない。
    const quotedColsF = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedColsF})
       SELECT ${quotedColsF} FROM "${table}" WHERE repo_id IS NOT NULL`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  /**
   * Phase F flip: PK 不変の derived テーブルへ repo_id 列を additive 追加し backfill する (冪等)。
   * 旧 repo フィルタ索引 (repo_name 先頭) を DROP し、CREATE_*_INDEXES の repo_id 先頭索引へ委ねる。
   * - 新規 DB / flip 済 DB (repo_id 列あり) は no-op。
   * - repoIdNotNull=true の場合 DEFAULT 0 sentinel で埋めるが、backfill で解決済み repo_id を入れる。
   */
  private migrateDerivedAdditiveRepoIdColumn(
    db: Database,
    opts: { table: string; repoIdNotNull: boolean; oldIndex: string },
  ): void {
    const { table, repoIdNotNull, oldIndex } = opts;
    const exists =
      db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_* が新スキーマを作る
    try {
      if (!columnExists(db, table, 'repo_id')) {
        // SQLite の ALTER ADD COLUMN は NOT NULL を default 無しで追加できないため、NOT NULL 列は
        // DEFAULT 0 sentinel を付ける (新規 DB の CREATE と整合)。NULL-able は plain INTEGER。
        db.run(
          `ALTER TABLE "${table}" ADD COLUMN repo_id INTEGER${repoIdNotNull ? ' NOT NULL DEFAULT 0' : ''}`,
        );
      }
      if (columnExists(db, table, 'repo_name')) {
        db.run(
          `INSERT OR IGNORE INTO repos (repo_name, created_at)
           SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           FROM "${table}" WHERE repo_name IS NOT NULL`,
        );
        // backfill: repo_name が repos に解決できる行のみ更新する。NOT NULL 列は未解決時に
        // DEFAULT 0 sentinel が残る (新規 DB の DEFAULT と整合)。NULL-able は NULL のまま許容。
        db.run(
          `UPDATE "${table}"
             SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)
           WHERE (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name) IS NOT NULL`,
        );
      }
      // 旧 repo フィルタ索引 (repo_name 先頭) を撤去する。新 repo_id 索引は CREATE_*_INDEXES が張る。
      db.run(`DROP INDEX IF EXISTS ${oldIndex}`);
    } catch (e) {
      this.logger.warn(
        `[derived additive repo_id ${table}] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Phase H-1: derived 3 テーブル (dora_metrics / pr_reviews / cross_source_correlations) から
   * 非正規化キャッシュの repo_name 列を物理撤去する (冪等)。`~/.claude/rules/
   * sqlite-table-definition.md` の 12-step テーブル再作成パターンに従う。
   *
   * - 各テーブルに repo_name 列が在る時のみ実行する (`columnExists` ガードで冪等)。
   * - 撤去前に repo_name から repos を self-seed し、未解決の repo_id を backfill する (Phase F flip /
   *   additive が既に repo_id を埋めている前提だが防御的に再実行する)。
   * - 新スキーマ (repo_name を持たない CREATE_* DDL) へ INSERT...SELECT で共有列をコピーする。
   *   repo_name 列は新スキーマに無いため自然に落ちる。
   * - CREATE_* (CREATE TABLE IF NOT EXISTS) の実行前に呼ぶ。新規 DB / 撤去済 DB は no-op。
   * - PRAGMA foreign_keys は init() で OFF のため踏襲。view/trigger を退避→再作成する。
   *
   * 撤去後、repo_name が必要な read メソッドは JOIN repos USING(repo_id) で r.repo_name を射影し、
   * 結果行のキー名 repo_name を維持する (下流契約は不変)。
   */
  private migrateDropDerivedRepoName(db: Database): void {
    for (const table of ['dora_metrics', 'pr_reviews', 'cross_source_correlations']) {
      this.dropDerivedRepoNameColumn(db, table);
    }
  }

  /** Phase H-1: 1 テーブルから repo_name 列を 12-step 再構築で物理撤去する (冪等)。 */
  private dropDerivedRepoNameColumn(db: Database, table: string): void {
    const exists =
      db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]?.values
        ?.length;
    if (!exists) return; // 新規 DB → CREATE_* が新スキーマ (repo_name なし) を作る
    if (!columnExists(db, table, 'repo_name')) return; // 既に撤去済 (冪等)
    if (!columnExists(db, table, 'repo_id')) {
      // repo_id が無い退化 DB は H-1 の対象外 (Phase F flip/additive が先に repo_id を入れる想定)。
      this.logger.warn(`[derived drop repo_name] ${table} has no repo_id, skip drop`);
      return;
    }

    try {
      // ── pre: repo_name から repos を self-seed し、未解決 repo_id を backfill する (防御的) ──
      db.run(
        `INSERT OR IGNORE INTO repos (repo_name, created_at)
         SELECT DISTINCT repo_name, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM "${table}" WHERE repo_name IS NOT NULL`,
      );
      db.run(
        `UPDATE "${table}"
           SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name)
         WHERE (SELECT repo_id FROM repos WHERE repos.repo_name = "${table}".repo_name) IS NOT NULL`,
      );

      // ── view / trigger を全件退避 (テーブル再作成中の検証エラーを防ぐ) ──
      const viewDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      const triggerDefs =
        db.exec("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")[0]
          ?.values ?? [];
      for (const t of triggerDefs) db.run(`DROP TRIGGER IF EXISTS "${asText(t[0] ?? '')}"`);
      for (const v of viewDefs) db.run(`DROP VIEW IF EXISTS "${asText(v[0] ?? '')}"`);

      db.run('BEGIN');
      try {
        this.rebuildDerivedTableDroppingRepoName(db, table);
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }

      this.recreateViewsAndTriggers(db, viewDefs, triggerDefs, '[derived drop repo_name]');
      this.save();
    } catch (e) {
      this.logger.error(
        `dropDerivedRepoNameColumn(${table}) failed`,
        e instanceof Error ? e : new Error(String(e)),
      );
      throw e;
    }
  }

  /** flip: derived テーブルを新スキーマ (repo_name なし) へ 12-step 再構築する。 */
  private rebuildDerivedTableDroppingRepoName(db: Database, table: string): void {
    const ddl = DERIVED_DROP_REPO_NAME_DDL[table];
    if (!ddl) {
      this.logger.warn(`[derived drop repo_name] no DDL registered for ${table}, skip`);
      return;
    }
    const re = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table}\b`);
    db.run(`DROP TABLE IF EXISTS "${table}__new"`);
    db.run(ddl.replace(re, `CREATE TABLE ${table}__new`));
    const newCols = (db.exec(`PRAGMA table_info("${table}__new")`)[0]?.values ?? []).map((c) =>
      asText(c[1] ?? ''),
    );
    const oldCols = new Set(
      (db.exec(`PRAGMA table_info("${table}")`)[0]?.values ?? []).map((c) => asText(c[1] ?? '')),
    );
    // 新スキーマの列のうち旧テーブルにも存在する列を共有列としてコピーする。新スキーマには
    // repo_name が無いため、共有列に repo_name は含まれず自然に落ちる。repo_id は両者に在るためコピーされる。
    const sharedCols = newCols.filter((c) => oldCols.has(c));
    const quotedColsHG = sharedCols.map((c) => `"${c}"`).join(',');
    db.run(
      `INSERT INTO "${table}__new" (${quotedColsHG})
       SELECT ${quotedColsHG} FROM "${table}"`,
    );
    db.run(`DROP TABLE "${table}"`);
    db.run(`ALTER TABLE "${table}__new" RENAME TO "${table}"`);
  }

  /**
   * 既存 DB の releases に repo_id 列が無ければ追加する (Phase B step1・非破壊)。
   * 新規 DB は CREATE_RELEASES に repo_id を含むため no-op。FK は init で off のため
   * ALTER では REFERENCES を付けず plain INTEGER とする (既存挙動と整合)。
   */
  private migrateReleasesRepoIdColumn(db: Database): void {
    try {
      if (!columnExists(db, 'releases', 'repo_id')) {
        db.run('ALTER TABLE releases ADD COLUMN repo_id INTEGER');
      }
      // release_id 代理キー列 (Phase B-2a・additive)。後続で子 FK 張替・PK flip に使う。
      if (!columnExists(db, 'releases', 'release_id')) {
        db.run('ALTER TABLE releases ADD COLUMN release_id INTEGER');
      }
    } catch (e) {
      this.logger.warn(
        `[releases columns migrate] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** releases.release_id を rowid から backfill する (release_id IS NULL のみ・冪等)。 */
  private backfillReleaseIds(db: Database): void {
    try {
      db.run('UPDATE releases SET release_id = rowid WHERE release_id IS NULL');
    } catch (e) {
      this.logger.warn(
        `[releases release_id backfill] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // release 子テーブルと、releases へ JOIN する際の tag 列名 (release_graphs のみ tag)。
  private static readonly RELEASE_CHILD_TABLES: ReadonlyArray<{ table: string; tagCol: string }> = [
    { table: 'release_graphs', tagCol: 'tag' },
    { table: 'release_files', tagCol: 'release_tag' },
    { table: 'release_coverage', tagCol: 'release_tag' },
    { table: 'release_code_graphs', tagCol: 'release_tag' },
    { table: 'release_code_graph_communities', tagCol: 'release_tag' },
    { table: 'release_file_analysis', tagCol: 'release_tag' },
    { table: 'release_function_analysis', tagCol: 'release_tag' },
  ];

  /**
   * release 子テーブルへ release_id 列を追加し、tag 列経由で releases.release_id を
   * backfill する (Phase B-2b-i・additive/非破壊・冪等)。
   *
   * Phase B-2b-iii flip 後は子テーブルに旧 tag 列 (tag / release_tag) が存在しないため、
   * 該当テーブルは backfill 対象外として skip する (release_id は FK で既に充足済み)。
   */
  private migrateReleaseChildrenReleaseId(db: Database): void {
    for (const { table, tagCol } of TrailDatabase.RELEASE_CHILD_TABLES) {
      try {
        // flip 済テーブルは旧 tag 列が無い → backfill 不要 (release_id が FK)。
        if (!columnExists(db, table, tagCol)) continue;
        if (!columnExists(db, table, 'release_id')) {
          db.run(`ALTER TABLE "${table}" ADD COLUMN release_id INTEGER`);
        }
        db.run(
          `UPDATE "${table}"
             SET release_id = (SELECT r.release_id FROM releases r WHERE r.tag = "${table}"."${tagCol}")
           WHERE release_id IS NULL`,
        );
      } catch (e) {
        this.logger.warn(
          `[release child release_id ${table}] ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /**
   * releases.repo_id を repo_name → repos で backfill する (repo_id IS NULL のみ・冪等)。
   *
   * Phase H-5: releases.repo_name 列は migrateDropReleaseSubtreeRepoName (createTables 内・本メソッドより
   * 前に走る) が物理撤去し、drop 直前に repo_id を backfill 済。そのため repo_name 列が無い環境では本 backfill
   * は不要・実行不能なので no-op で返す (列が無いまま UPDATE すると毎 init で "no such column" 警告が出るため)。
   */
  private backfillReleaseRepoIds(db: Database): void {
    if (!columnExists(db, 'releases', 'repo_name')) return; // Phase H-5: repo_id backfill は drop 直前に完了済
    try {
      db.run(
        `UPDATE releases
           SET repo_id = (SELECT repo_id FROM repos WHERE repos.repo_name = releases.repo_name)
         WHERE repo_id IS NULL`,
      );
    } catch (e) {
      this.logger.warn(
        `[releases repo_id backfill] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** repo_name 列を持つ既存テーブルから distinct repo_name を repos へ INSERT OR IGNORE する。 */
  private seedReposFromLegacyRepoNames(db: Database): void {
    // repo_name 列を持つ既知テーブル群。旧 DB に存在しないテーブルは try/catch で skip。
    // 全 Phase で repo_name 列を撤去済のため、現状はどのテーブルも残っていない。各 Phase の drop
    // migration が drop 直前に self-seed するため、ここに残すと撤去後 `SELECT repo_name` が毎 init で
    // throw → warn ログを出すだけで実害がない。
    // 全 Phase (H-1〜H-5) で repo_name 列を撤去済。各 Phase の drop migration が drop 直前に
    // self-seed するため、ここに列挙するテーブルは現時点で存在しない。
  }

  /** 複数の ALTER TABLE 文を順に実行し、"Column already exists" 相当のエラーは無視する。 */
  private runAlterStatements(db: Database, sqls: readonly string[]): void {
    for (const sql of sqls) {
      try { db.run(sql); } catch { /* Column already exists */ }
    }
  }

  /** バックフィル処理を non-fatal で実行する。失敗した場合は warn ログを出して継続する。 */
  private runNonFatalBackfill(name: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.logger.warn(`${name} (init) failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private createTables(): void {
    const db = this.ensureDb();
    // FK 強制は init() で OFF にしている。sql.js 時代の `db.run('PRAGMA
    // foreign_keys = ON')` は WASM 側で no-op だったため、ここで ON にすると
    // 既存挙動 (FK 未強制) と乖離してテスト fixture (orphan FK 値を含むもの)
    // が失敗する。詳細は init() のコメント参照。
    // repo 正規化の基盤テーブル (Phase A)。後続 Phase で各テーブルが repo_id を
    // FK 参照するため最初に作成する。Phase A 時点では参照する子はまだ無い (非破壊・追加のみ)。
    db.run(CREATE_REPOS);
    // Phase C-2 flip: 既存 DB の current_* 6 テーブルを repo_id PK スキーマへ再構築する。
    // CREATE TABLE IF NOT EXISTS は既存テーブルに無効なため、CREATE_CURRENT_* 実行前に呼ぶ。
    // 新規 DB / flip 済 DB では no-op。repos を self-seed してから backfill するため、
    // init() の seedReposFromLegacyRepoNames より前に走っても repo_id を解決できる。
    this.migrateCurrentTablesRepoId(db);
    // Phase H-3: current 系 6 テーブルから repo_name 列 (非正規化キャッシュ) を物理撤去する。
    // migrateCurrentTablesRepoId が先に repo_id PK を入れた後に呼ぶ。CREATE TABLE IF NOT EXISTS は
    // 既存テーブルに無効なため CREATE_CURRENT_* の前に呼ぶ。新規 DB / 撤去済 DB では no-op。
    // ALTER 由来の mappings_json 等は再構築時に保全する (rebuildCurrentTableDroppingRepoName 参照)。
    this.migrateDropCurrentRepoName(db);
    // Phase D flip: 既存 DB の session/commit 系 (sessions additive + session_commits /
    // commit_files / session_commit_resolutions の PK 再設計) を repo_id 化する。
    // CREATE TABLE IF NOT EXISTS は既存テーブルに無効なため、CREATE_SESSIONS /
    // CREATE_SESSION_COMMITS 等の実行前に呼ぶ。新規 DB / flip 済 DB では no-op。
    this.migrateSessionCommitTablesRepoId(db);
    // Phase H-4: session/commit 系 4 テーブル (sessions / session_commits / commit_files /
    // session_commit_resolutions) から repo_name 列 (非正規化キャッシュ) を物理撤去する。
    // migrateSessionCommitTablesRepoId が先に repo_id を入れた後に呼ぶ。CREATE TABLE IF NOT EXISTS は
    // 既存テーブルに無効なため CREATE_SESSIONS / CREATE_SESSION_COMMITS 等の前に呼ぶ。新規 DB /
    // 撤去済 DB では no-op。sessions は additive 撤去のため ALTER 由来の列を全保全する
    // (rebuildSessionCommitTableDroppingRepoName 参照)。
    this.migrateDropSessionCommitRepoName(db);
    db.run(CREATE_SESSIONS);
    db.run(CREATE_SESSION_COSTS);
    db.run(CREATE_DAILY_COUNTS);
    db.run(CREATE_MESSAGES);
    db.run(CREATE_SESSION_COMMITS);
    // Phase B-2b-iii flip: 既存 DB の releases + 子 7 を代理キー (release_id) スキーマへ再構築する。
    // CREATE TABLE IF NOT EXISTS は既存テーブルに無効なため、CREATE_RELEASES 実行前に呼ぶ。
    // 新規 DB / flip 済 DB では no-op。子テーブル (release_code_graph_communities 等) も
    // ここで rebuild するため、それらの CREATE 文より前に実行する。
    this.migrateReleasesFlip(db);
    // Phase H-5: releases / release_file_analysis / release_function_analysis から repo_name 列
    // (非正規化キャッシュ) を物理撤去する。migrateReleasesFlip が先に release_id / repo_id を入れた後に呼ぶ。
    // CREATE TABLE IF NOT EXISTS は既存テーブルに無効なため CREATE_RELEASES / CREATE_RELEASE_*_ANALYSIS の
    // 前に呼ぶ。新規 DB / 撤去済 DB では no-op (flip が新 DDL で repo_name なしに再構築済の場合も含む)。
    // release_*_analysis は PK から repo_name を除いた形へ張替える (rebuildReleaseSubtreeTableDroppingRepoName)。
    this.migrateDropReleaseSubtreeRepoName(db);
    db.run(CREATE_RELEASES);
    db.run(CREATE_RELEASE_FILES);
    db.run(CREATE_RELEASE_COVERAGE);
    db.run(CREATE_CURRENT_COVERAGE);
    for (const idx of CREATE_CURRENT_COVERAGE_INDEXES) {
      db.run(idx);
    }
    // 既存 DB に残った未使用テーブルを除去（行 0 件のため安全）
    for (const orphan of ['c4_models', 'release_features']) {
      try {
        db.run(`DROP TABLE IF EXISTS ${orphan}`);
      } catch (e) {
        this.logger.warn(`failed to drop ${orphan}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.migrateCurrentGraphsSchema(db);
    db.run(CREATE_CURRENT_GRAPHS);
    db.run(CREATE_RELEASE_GRAPHS);
    this.migrateTrailGraphsTable(db);
    db.run(CREATE_CURRENT_CODE_GRAPHS);
    db.run(CREATE_RELEASE_CODE_GRAPHS);
    db.run(CREATE_CODE_DECISION_COMMENTS);
    db.run(CREATE_CURRENT_CODE_GRAPH_COMMUNITIES);
    db.run(CREATE_RELEASE_CODE_GRAPH_COMMUNITIES);
    // Legacy DBs lack stable_key on *_code_graph_communities; without this
    // ALTER, idx_ccgc_stable_key / idx_rcgc_stable_key in CREATE_RELEASE_INDEXES
    // fail with "no such column: stable_key" during init.
    ensureCommunityStableKeyColumn(db, 'current_code_graph_communities');
    ensureCommunityStableKeyColumn(db, 'release_code_graph_communities');
    this.migrateFileAnalysisSchema(db);
    db.run(CREATE_CURRENT_FILE_ANALYSIS);
    db.run(CREATE_RELEASE_FILE_ANALYSIS);
    db.run(CREATE_CURRENT_FUNCTION_ANALYSIS);
    db.run(CREATE_RELEASE_FUNCTION_ANALYSIS);
    // architectural centrality 関連カラムの追加。既存 DB に対して
    // CREATE TABLE IF NOT EXISTS は no-op になるため ALTER TABLE で補う。
    // CHECK 制約は ALTER ADD COLUMN では付かないが、insert 経路は trail-core の型で守る。
    this.runAlterStatements(db, [
      'ALTER TABLE current_file_analysis ADD COLUMN cross_pkg_in_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_file_analysis ADD COLUMN external_consumer_pkgs INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_file_analysis ADD COLUMN total_in_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_file_analysis ADD COLUMN is_barrel INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_file_analysis ADD COLUMN centrality_score REAL NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN cross_pkg_in_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN external_consumer_pkgs INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN total_in_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN is_barrel INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN centrality_score REAL NOT NULL DEFAULT 0',
      'ALTER TABLE current_function_analysis ADD COLUMN fan_out INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_function_analysis ADD COLUMN distinct_callees INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_function_analysis ADD COLUMN fan_out INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_function_analysis ADD COLUMN distinct_callees INTEGER NOT NULL DEFAULT 0',
      "ALTER TABLE current_function_analysis ADD COLUMN function_role TEXT NOT NULL DEFAULT 'peripheral'",
      "ALTER TABLE release_function_analysis ADD COLUMN function_role TEXT NOT NULL DEFAULT 'peripheral'",
      // C4 architecture overlay (UI / Logic 分類) の category 列。
      // CHECK 制約は新規 DB の CREATE TABLE で付与し、既存 DB への ALTER では
      // 型安全を trail-core の TS 型で担保する (centrality 列と同方針)。
      "ALTER TABLE current_file_analysis ADD COLUMN category TEXT NOT NULL DEFAULT 'logic'",
      "ALTER TABLE release_file_analysis ADD COLUMN category TEXT NOT NULL DEFAULT 'logic'",
    ]);
    for (const idx of CREATE_FILE_ANALYSIS_INDEXES) {
      db.run(idx);
    }
    db.run(CREATE_SKILL_MODELS_TABLE);
    db.run(CREATE_SKILL_MODELS_RESOLVED_VIEW);
    db.run(CREATE_MESSAGE_COMMITS);
    db.run(CREATE_COMMIT_FILES);
    db.run(CREATE_SESSION_COMMIT_RESOLUTIONS);
    // session_commits / commit_files への repo_id 追加はインデックス作成より前に行う
    // （idx_session_commits_repo_id_* / idx_commit_files_repo_id_* が repo_id を参照するため）。
    // Phase D flip が必ず先に repo_id を入れるため、ここの repo_id ALTER は防御的な保険
    // (flip 済テーブルでは Column already exists で no-op)。
    // Phase H-4: repo_name 列は migrateDropSessionCommitRepoName で撤去済のため再追加しない
    // (ここで ALTER ADD repo_name すると撤去が無効化される)。
    this.runAlterStatements(db, [
      'ALTER TABLE session_commits ADD COLUMN repo_id INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE commit_files ADD COLUMN repo_id INTEGER NOT NULL DEFAULT 0',
    ]);
    db.run('CREATE INDEX IF NOT EXISTS idx_commit_files_hash ON commit_files(commit_hash)');
    for (const sql of [...CREATE_INDEXES, ...CREATE_RELEASE_INDEXES]) {
      db.run(sql);
    }
    db.run(CREATE_MESSAGE_TOOL_CALLS);
    for (const sql of CREATE_MESSAGE_TOOL_CALLS_INDEXES) {
      db.run(sql);
    }
    // Hotspot / activity map 集計用 (trail-time-axis-requirements 3.2)
    db.run('CREATE INDEX IF NOT EXISTS idx_messages_subagent_type ON messages(subagent_type)');
    db.run('CREATE INDEX IF NOT EXISTS idx_message_tool_calls_tool_name_file_path ON message_tool_calls(tool_name, file_path)');
    // Phase E flip: 既存 DB の c4_manual 系 3 テーブルを repo_id PK + 複合 FK スキーマへ再構築する。
    // CREATE TABLE IF NOT EXISTS は既存テーブルに無効なため、CREATE_C4_MANUAL_* の実行前に呼ぶ。
    // 新規 DB / flip 済 DB では no-op。repos を self-seed してから backfill する。
    this.migrateC4ManualTablesRepoId(db);
    // Phase H-2: c4_manual 系 3 テーブルから repo_name 列 (非正規化キャッシュ) を物理撤去する。
    // migrateC4ManualTablesRepoId が先に repo_id PK を入れた後に呼ぶ。CREATE TABLE IF NOT EXISTS は
    // 既存テーブルに無効なため CREATE_C4_MANUAL_* の前に呼ぶ。新規 DB / 撤去済 DB では no-op。
    this.migrateDropC4ManualRepoName(db);
    db.run(CREATE_C4_MANUAL_ELEMENTS);
    db.run(CREATE_C4_MANUAL_RELATIONSHIPS);
    db.run(CREATE_C4_MANUAL_GROUPS);
    for (const idx of CREATE_C4_MANUAL_INDEXES) {
      db.run(idx);
    }
    // Phase F flip: 既存 DB の derived テーブル (dora_metrics PK 再設計 + pr_reviews /
    // cross_source_correlations の repo_id additive) を repo_id 化する。CREATE TABLE IF NOT EXISTS
    // は既存テーブルに無効なため、CREATE_DORA_METRICS 等の実行前に呼ぶ。新規 DB / flip 済 DB では no-op。
    this.migrateDerivedTablesRepoId(db);
    // Phase H-1: derived 3 テーブルから repo_name 列 (非正規化キャッシュ) を物理撤去する。
    // migrateDerivedTablesRepoId が先に repo_id を埋めた後に呼ぶ。CREATE TABLE IF NOT EXISTS は
    // 既存テーブルに無効なため CREATE_* の前に呼ぶ。新規 DB / 撤去済 DB では no-op。
    this.migrateDropDerivedRepoName(db);
    // LEP Layer 4 (Aggregator) の DORA 指標出力先。新規テーブル追加のみ (既存 DDL 不変)。
    db.run(CREATE_DORA_METRICS);
    // LEP 新ソース参照実装 (Step 4b): GitHub PR review の生データ。新規テーブル追加のみ。
    db.run(CREATE_PR_REVIEWS);
    db.run(CREATE_PR_REVIEW_COMMENTS);
    for (const idx of CREATE_PR_REVIEW_INDEXES) {
      db.run(idx);
    }
    // PR review finding (Step 4c)。memory_review_findings とは独立 (新規テーブルのみ)。
    db.run(CREATE_PR_REVIEW_FINDINGS);
    for (const idx of CREATE_PR_REVIEW_FINDINGS_INDEXES) {
      db.run(idx);
    }
    // cross-source 相関 (Step 4d)。新規テーブルのみ。
    db.run(CREATE_CROSS_SOURCE_CORRELATIONS);
    for (const idx of CREATE_CROSS_SOURCE_CORRELATIONS_INDEXES) {
      db.run(idx);
    }
    // Phase 5 S1 (Emergency Protocol)。新規テーブルのみ。
    db.run(CREATE_SAFE_POINTS);
    db.run(CREATE_EMERGENCY_LOG);
    for (const idx of CREATE_EMERGENCY_INDEXES) {
      db.run(idx);
    }
    // Phase 6 S1 (Flight Review)。新規テーブルのみ。
    db.run(CREATE_FLIGHT_REVIEWS);
    for (const idx of CREATE_FLIGHT_REVIEW_INDEXES) {
      db.run(idx);
    }
    // Phase 6 S2 (Debrief / User Feedback)。新規テーブル + flight_reviews への列追加。
    // 列追加は列ごと独立に columnExists 判定する（まとめ判定は部分適用から復旧できない）。
    db.run(CREATE_USER_FEEDBACK_ENTRIES);
    for (const idx of CREATE_USER_FEEDBACK_INDEXES) {
      db.run(idx);
    }
    if (!columnExists(db, 'flight_reviews', 'next_concerns')) {
      db.run(`ALTER TABLE flight_reviews ADD COLUMN next_concerns TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(next_concerns))`);
    }
    if (!columnExists(db, 'flight_reviews', 'lesson_candidates')) {
      db.run(`ALTER TABLE flight_reviews ADD COLUMN lesson_candidates TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(lesson_candidates))`);
    }
    // Phase 6 S4 (Rationale Audit)。列ごと独立 columnExists（S2 と同方針）。
    if (!columnExists(db, 'flight_reviews', 'rationale_audit_status')) {
      db.run(`ALTER TABLE flight_reviews ADD COLUMN rationale_audit_status TEXT NOT NULL DEFAULT 'unaudited' CHECK (rationale_audit_status IN ('unaudited', 'valid', 'needs_fix', 'rejected'))`);
    }
    // 既存 DB 向け: UNIQUE 制約をインデックスとして追加（新規 DB は CREATE TABLE の UNIQUE 制約で対応済み）
    this.runAlterStatements(db, ['CREATE UNIQUE INDEX IF NOT EXISTS idx_message_tool_calls_message_uuid_call_index ON message_tool_calls(message_uuid, call_index)']);

    this.migrateMessageCommitsSchema(db);

    // Add columns for existing DBs (may already exist)
    const sessionAlters = [
      'ALTER TABLE sessions ADD COLUMN commits_resolved_at TEXT',
      'ALTER TABLE sessions ADD COLUMN peak_context_tokens INTEGER',
      'ALTER TABLE sessions ADD COLUMN initial_context_tokens INTEGER',
      'ALTER TABLE sessions ADD COLUMN git_branch TEXT',
      'ALTER TABLE sessions ADD COLUMN interruption_reason TEXT',
      'ALTER TABLE sessions ADD COLUMN interruption_context_tokens INTEGER',
      'ALTER TABLE sessions ADD COLUMN compact_count INTEGER',
      'ALTER TABLE sessions ADD COLUMN message_commits_resolved_at TEXT',
      "ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'claude_code'",
      'ALTER TABLE sessions ADD COLUMN sub_agent_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE sessions ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE sessions ADD COLUMN assistant_message_count INTEGER NOT NULL DEFAULT 0',
    ];
    this.runAlterStatements(db, sessionAlters);
    this.runAlterStatements(db, [
      'ALTER TABLE releases ADD COLUMN total_lines INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE releases ADD COLUMN release_time_min REAL',
    ]);
    this.migrateDropSessionsProjectColumn(db);
    this.runAlterStatements(db, [
      'ALTER TABLE messages ADD COLUMN rule_recommended_model TEXT',
      'ALTER TABLE messages ADD COLUMN feature_recommended_model TEXT',
      'ALTER TABLE messages ADD COLUMN cost_category TEXT',
      'ALTER TABLE messages ADD COLUMN duration_ms INTEGER',
      'ALTER TABLE messages ADD COLUMN tool_result_size INTEGER',
      'ALTER TABLE messages ADD COLUMN agent_description TEXT',
      'ALTER TABLE messages ADD COLUMN agent_model TEXT',
      'ALTER TABLE messages ADD COLUMN permission_mode TEXT',
      'ALTER TABLE messages ADD COLUMN skill TEXT',
      'ALTER TABLE messages ADD COLUMN agent_id TEXT',
      'ALTER TABLE messages ADD COLUMN source_tool_assistant_uuid TEXT',
      'ALTER TABLE messages ADD COLUMN source_tool_use_id TEXT',
      'ALTER TABLE messages ADD COLUMN system_command TEXT',
      'ALTER TABLE messages ADD COLUMN subagent_type TEXT',
    ]);

    // AST メトリクス列追加（既存 DB 向け）
    this.runAlterStatements(db, [
      'ALTER TABLE current_file_analysis ADD COLUMN line_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_file_analysis ADD COLUMN cyclomatic_complexity_max INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN line_count INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_file_analysis ADD COLUMN cyclomatic_complexity_max INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE current_function_analysis ADD COLUMN cyclomatic_complexity INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE release_function_analysis ADD COLUMN cyclomatic_complexity INTEGER NOT NULL DEFAULT 0',
    ]);

    // service_type カラム追加（既存 DB 向け）
    this.runAlterStatements(db, ['ALTER TABLE c4_manual_elements ADD COLUMN service_type TEXT']);

    // Seed skill_models with defaults if empty
    const smCount = db.exec('SELECT COUNT(*) FROM skill_models');
    if (Number(smCount[0]?.values[0]?.[0]) === 0) {
      const smStmt = db.prepare('INSERT OR IGNORE INTO skill_models (skill, canonical_skill, recommended_model) VALUES (?, ?, ?)');
      for (const [skill, canonical, model] of DEFAULT_SKILL_MODELS) {
        smStmt.run([skill, canonical, model]);
      }
      smStmt.free();
    }

    this.migrateTimestampsToUTC(db);
    this.migrateToolUseResult(db);
    this.migrateMessageCommitsToUserUuid(db);
    // Phase D-2: subagent_type を既存データに後付けで埋める（_migrations で冪等性確保）。
    // importAll() を待たず init 段階で実行するため、ユーザーが同期未実行でも有効。
    this.runNonFatalBackfill('backfillSubagentType', () => this.backfillSubagentType());
    this.runNonFatalBackfill('backfillSourceToolLinkFields', () => this.backfillSourceToolLinkFields());
    this.runNonFatalBackfill('backfillRepoName_v1', () => this.backfillRepoName_v1());
    this.runNonFatalBackfill('backfillDerivedCounts_v1', () => this.backfillDerivedCounts_v1());
    this.runNonFatalBackfill('backfillSessionsRepoNameFromCwd_v1', () => this.backfillSessionsRepoNameFromCwd_v1());
    // ALTER TABLE / backfill 等のスキーマ変更をディスクに永続化する。
    // save() を呼ばないと _migrations フラグが保存されず、次回起動で再実行される。
    this.save();
  }

  /**
   * 既存 row の session_commits.repo_name / commit_files.repo_name を sessions.repo_name から
   * バックフィルする。`_migrations` テーブルで一度だけ走らせる冪等運用。
   *
   * Phase H-4: session_commits / commit_files / sessions から repo_name 列を物理撤去した。repo 帰属は
   * repo_id へ正規化済で、Phase D flip / migrateDropSessionCommitRepoName が drop 直前に repo_name から
   * repo_id を backfill 済のため、この repo_name ベース backfill は完全に superseded。repo_name 列が無い
   * 環境では UPDATE がそのまま失敗するため、列が無ければ no-op で done を記録する (再実行ループ防止)。
   */
  private backfillRepoName_v1(): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'repo_name_backfill_v1'");
    if (done[0]?.values?.length) return;

    // Phase H-4: repo_name 列が撤去済なら本 migration は不要 (repo 帰属は repo_id で確定済)。done を
    // 記録して終了する。新規 DB / 撤去済 DB はここに入る。
    if (!columnExists(db, 'session_commits', 'repo_name')) {
      this.logger.info(
        '[Migration] repo_name_backfill_v1: repo_name column removed (Phase H-4); superseded by repo_id flip backfill, marking done',
      );
      db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('repo_name_backfill_v1')");
      return;
    }

    // session_commits: 既存 row の repo_name='' を sessions.repo_name から埋める
    db.run(
      `UPDATE session_commits
         SET repo_name = (
           SELECT s.repo_name FROM sessions s WHERE s.id = session_commits.session_id
         )
         WHERE repo_name = ''
           AND EXISTS (
             SELECT 1 FROM sessions s
             WHERE s.id = session_commits.session_id AND s.repo_name != ''
           )`,
    );
    const updatedCommits = db.exec(
      "SELECT COUNT(*) FROM session_commits WHERE repo_name != ''",
    )[0]?.values[0]?.[0] ?? 0;

    // commit_files: session_commits 経由で repo_name を逆引き
    db.run(
      `UPDATE commit_files
         SET repo_name = (
           SELECT sc.repo_name FROM session_commits sc
           WHERE sc.commit_hash = commit_files.commit_hash
             AND sc.repo_name != ''
           LIMIT 1
         )
         WHERE repo_name = ''
           AND EXISTS (
             SELECT 1 FROM session_commits sc
             WHERE sc.commit_hash = commit_files.commit_hash AND sc.repo_name != ''
           )`,
    );
    const updatedFiles = db.exec(
      "SELECT COUNT(*) FROM commit_files WHERE repo_name != ''",
    )[0]?.values[0]?.[0] ?? 0;

    this.logger.info(
      `[Migration] repo_name_backfill_v1: session_commits non-empty=${asText(updatedCommits)}, commit_files non-empty=${asText(updatedFiles)}`,
    );
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('repo_name_backfill_v1')");
  }

  /**
   * sessions.repo_name を JSONL の `cwd` 由来に再計算する。
   *
   * 旧 importer (line 3386) は repoName を起動 ws の gitRoot basename で stamp していたため、
   * 他プロジェクトのセッションも `anytime-markdown` 等に誤分類されていた。本 migration で
   * 1 回限り JSONL の cwd を読み直し、worktree 検出 + basename 抽出で正しい repo_name に
   * 書き換える。詳細: plan/20260518-sessions-repo-name-from-cwd.ja.md
   *
   * フォールバック (案 A): JSONL cwd が取れない場合は file_path の `.claude/projects/<dir>/`
   * の `<dir>` から先頭ハイフンを除いた値を採用する。起動 ws の basename はフォールバック
   * に使わない (旧バグの再生産防止)。
   */
  private backfillSessionsRepoNameFromCwd_v1(): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'sessions_repo_name_from_cwd_v1'");
    if (done[0]?.values?.length) return;

    const startedAt = Date.now();
    // Phase H-4: sessions.repo_name 列は撤去済。repo 帰属は repo_id で表現するため、cwd 由来の
    // 正しい repo_name を repoIdForName で repo_id へ解決し、現在の repo_id と異なる行のみ更新する
    // (旧バグで誤分類された repo_id を是正する。旧実装の repo_name 直接書き換えと意味等価)。
    const rows = db.exec("SELECT id, file_path, repo_id FROM sessions WHERE file_path != ''")[0]?.values ?? [];
    let updated = 0;
    let unchanged = 0;
    let missing = 0;
    const stmt = db.prepare('UPDATE sessions SET repo_id = ? WHERE id = ?');
    try {
      for (const row of rows) {
        const idStr = String(row[0]);
        const filePathStr = asText(row[1] ?? '');
        const oldRepoId = row[2] === null || row[2] === undefined ? null : Number(row[2]);
        let derived = extractRepoNameFromJsonl(filePathStr);
        if (derived === null) {
          const m = /\/projects\/([^/]+)\//.exec(filePathStr);
          if (m?.[1]) derived = m[1].replace(/^-+/, '') || null;
        }
        if (!derived) { missing++; continue; }
        const derivedRepoId = this.repoIdForName(derived);
        if (derivedRepoId === oldRepoId) { unchanged++; continue; }
        stmt.run([derivedRepoId, idStr]);
        updated++;
      }
    } finally {
      stmt.free();
    }

    this.logger.info(
      `[Migration] sessions_repo_name_from_cwd_v1: updated=${updated}, unchanged=${unchanged}, missing=${missing} (${Date.now() - startedAt}ms)`,
    );
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('sessions_repo_name_from_cwd_v1')");
  }

  private backfillDerivedCounts_v1(): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'derived_counts_backfill_v1'");
    if (done[0]?.values?.length) return;

    const startedAt = Date.now();
    db.run(
      `UPDATE sessions SET
         sub_agent_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND tool_name = 'Agent'
         ), 0),
         error_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND is_error = 1
         ), 0),
         assistant_message_count = COALESCE((
           SELECT COUNT(*) FROM messages
           WHERE session_id = sessions.id AND type = 'assistant' AND is_meta = 0
         ), 0)`,
    );
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('derived_counts_backfill_v1')");
    this.logger.info(`[Migration] derived_counts_backfill_v1: done (${Date.now() - startedAt}ms)`);
  }

  /** Parse one JSONL file for source_tool_link fields and run updates. Returns count of updated rows. */
  private backfillSourceToolLinksForSession(
    sid: string,
    filePath: string,
    updateStmt: SqlJsCompatStatement,
  ): number {
    if (!fs.existsSync(filePath)) return 0;
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return 0;
    }
    let updated = 0;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let raw: RawLine;
      try {
        raw = JSON.parse(trimmed) as RawLine;
      } catch {
        continue;
      }
      if (!raw.uuid) continue;
      const srcAssistant = raw.sourceToolAssistantUUID ?? null;
      const srcToolUseId = raw.sourceToolUseID ?? null;
      if (!srcAssistant && !srcToolUseId) continue;
      updateStmt.run([srcAssistant, srcToolUseId, sid, raw.uuid]);
      updated++;
    }
    return updated;
  }

  private backfillSourceToolLinkFields(): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'source_tool_link_backfill_v1'");
    if (done[0]?.values?.length) return;

    const rows = db.exec(
      `SELECT s.id, s.file_path
       FROM sessions s
       WHERE s.source = 'claude_code'
         AND EXISTS (
           SELECT 1 FROM messages m
           WHERE m.session_id = s.id
             AND (m.source_tool_assistant_uuid IS NULL OR m.source_tool_assistant_uuid = '')
         )`,
    )[0]?.values ?? [];

    const updateStmt = db.prepare(
      'UPDATE messages SET source_tool_assistant_uuid = ?, source_tool_use_id = ? WHERE session_id = ? AND uuid = ?',
    );
    let updated = 0;
    for (const row of rows) {
      const sid = asText(row[0] ?? '');
      const filePath = asText(row[1] ?? '');
      if (!sid || !filePath) continue;
      updated += this.backfillSourceToolLinksForSession(sid, filePath, updateStmt);
    }
    updateStmt.free();
    this.logger.info(`[Migration] source_tool_link_backfill_v1: updated=${updated}`);
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('source_tool_link_backfill_v1')");
  }

  private migrateDropSessionsProjectColumn(db: Database): void {
    let foreignKeysWereEnabled = true;
    try {
      const colInfo = db.exec(`PRAGMA table_info(sessions)`);
      const cols = (colInfo[0]?.values ?? []).map((r) => String(r[1]));
      if (!cols.includes('project')) return;
      const fkInfo = db.exec('PRAGMA foreign_keys');
      foreignKeysWereEnabled = Number(fkInfo[0]?.values?.[0]?.[0] ?? 1) === 1;
      // Phase D: この migration は migrateSessionsRepoIdColumn の後に走るため、ここに来る時点で
      // sessions には既に additive な repo_id 列 (backfill 済) が存在する。project 撤去再構築で
      // repo_id を SELECT に含めないと、追加直後の repo_id 列とその値が消失する。新スキーマと
      // INSERT...SELECT の双方に repo_id を含め、再構築をまたいで保持する。repo_id が無い退化 DB
      // (project 列はあるが repo_id 列が無い) では NULL を補い、後続 importSession で解決される。
      const hasRepoId = columnExists(db, 'sessions', 'repo_id');
      const repoIdColDdl = hasRepoId ? '\n        repo_id INTEGER,' : '';
      // Phase H-4: repo_name 列は migrateDropSessionCommitRepoName が先に物理撤去するため、
      // ここに来る時点で通常は存在しない。project 列付きの退化 DB でも repo_name が残っている場合のみ
      // 再構築先に含める (列がなければ SELECT repo_name が "no such column" で失敗するため条件化する)。
      const hasRepoName = columnExists(db, 'sessions', 'repo_name');
      const repoNameColDdl = hasRepoName ? "\n        repo_name TEXT NOT NULL DEFAULT '',\n" : '';
      const repoNameSelect = hasRepoName ? ' repo_name,' : '';
      db.run('PRAGMA foreign_keys = OFF');
      db.run('BEGIN TRANSACTION');
      db.run(`CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL DEFAULT '',${repoNameColDdl}${repoIdColDdl}
        version TEXT NOT NULL DEFAULT '',
        entrypoint TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL DEFAULT '',
        commits_resolved_at TEXT,
        peak_context_tokens INTEGER,
        initial_context_tokens INTEGER,
        git_branch TEXT,
        interruption_reason TEXT,
        interruption_context_tokens INTEGER,
        message_commits_resolved_at TEXT,
        source TEXT NOT NULL DEFAULT 'claude_code',
        compact_count INTEGER
      )`);
      db.run(`INSERT INTO sessions_new (
        id, slug,${repoNameSelect}${hasRepoId ? ' repo_id,' : ''} version, entrypoint, model,
        start_time, end_time, message_count, file_path, file_size, imported_at,
        commits_resolved_at, peak_context_tokens, initial_context_tokens, git_branch,
        interruption_reason, interruption_context_tokens, message_commits_resolved_at,
        source, compact_count
      )
      SELECT
        id, slug,${repoNameSelect}${hasRepoId ? ' repo_id,' : ''} version, entrypoint, model,
        start_time, end_time, message_count, file_path, file_size, imported_at,
        commits_resolved_at, peak_context_tokens, initial_context_tokens, git_branch,
        interruption_reason, interruption_context_tokens, message_commits_resolved_at,
        source, compact_count
      FROM sessions`);
      db.run('DROP TABLE sessions');
      db.run('ALTER TABLE sessions_new RENAME TO sessions');
      db.run('COMMIT');
      if (foreignKeysWereEnabled) db.run('PRAGMA foreign_keys = ON');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch { /* ignore */ }
      if (foreignKeysWereEnabled) {
        try { db.run('PRAGMA foreign_keys = ON'); } catch (error_) { this.logger.error('restore foreign_keys failed', error_); }
      }
      this.logger.error('migrateDropSessionsProjectColumn failed', e);
    }
  }

  /**
   * 既存 session_commits の各コミットに対して変更ファイルを commit_files にバックフィルする。
   * ai-first-try-success-rate 指標がファイル overlap で failure 判定するために必要。
   * importAll の先頭で gitRoot が確定している状態で呼ぶ。
   */
  private backfillCommitFiles(gitRoot: string, onProgress?: (msg: string) => void): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'commit_files_backfill_v2'");
    if (done[0]?.values?.length) return;

    // Phase D: commit_files の PK が (repo_id, commit_hash, file_path) になったため、各 commit_hash の
    // repo_id を session_commits から引いて埋める。同一 hash が複数 repo にまたがる場合は
    // MIN(repo_id) を採用する (DISTINCT 1 行に正規化)。
    // Phase H-4: repo_name 列は撤去済。repo 帰属は repo_id のみで表現する。
    const commitRes = db.exec(
      `SELECT commit_hash, MIN(repo_id) AS repo_id
       FROM session_commits
       WHERE NOT EXISTS (SELECT 1 FROM commit_files cf WHERE cf.commit_hash = session_commits.commit_hash)
       GROUP BY commit_hash`,
    );
    const commits = (commitRes[0]?.values ?? []).map((row) => ({
      hash: asText(row[0] ?? ''),
      repoId: Number(row[1] ?? 0),
    }));
    if (commits.length === 0) {
      db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('commit_files_backfill_v2')");
      return;
    }

    onProgress?.(`Backfilling commit files for ${commits.length} commits...`);
    this.logger.info(`[Migration] commit_files_backfill_v2: backfilling file lists for ${commits.length} commits`);

    const insertStmt = db.prepare('INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)');
    try {
      let processed = 0;
      let skipped = 0;
      for (const { hash, repoId } of commits) {
        try {
          const out = execFileSync('git', [
            'show', '--format=', '--numstat', hash,
          ], { encoding: 'utf-8', timeout: 5_000, cwd: gitRoot });
          for (const line of out.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split('\t');
            const filePath = parts[2];
            if (filePath) insertStmt.run([hash, filePath, repoId]);
          }
          processed++;
        } catch {
          // Commit may have been garbage-collected or outside this repo — skip.
          skipped++;
        }
        if (processed % 50 === 0) {
          onProgress?.(`Backfilling commit files: ${processed}/${commits.length}`);
        }
      }
      this.logger.info(`[Migration] commit_files_backfill_v2: processed=${processed}, skipped=${skipped}`);
    } finally {
      insertStmt.free();
    }

    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('commit_files_backfill_v2')");
  }

  /**
   * 旧 matchCommitsToMessages は assistant メッセージ UUID を message_commits.message_uuid に
   * 保存していたため、Lead Time / Commit Success Rate の計算（user UUID と突合）が常に空になる
   * 不具合があった。既存データを破棄し、次回同期で user UUID ベースで再構築する。
   */
  private migrateMessageCommitsToUserUuid(db: Database): void {
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'message_commits_to_user_uuid'");
    if (done[0]?.values?.length) return;

    this.logger.info(
      '[Migration] message_commits_to_user_uuid: clearing message_commits and resetting resolved timestamps for rebuild',
    );
    db.run('DELETE FROM message_commits');
    db.run('UPDATE sessions SET message_commits_resolved_at = NULL');
    db.run("INSERT INTO _migrations (key) VALUES ('message_commits_to_user_uuid')");
  }

  private migrateMessageCommitsSchema(db: Database): void {
    db.run('CREATE INDEX IF NOT EXISTS idx_message_commits_session ON message_commits(session_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_message_commits_commit ON message_commits(commit_hash)');
  }

  /**
   * 既存 messages に対して subagent_type を後付けで埋める。一度だけ実行（_migrations で冪等性確保）。
   *   1) 各 project 配下の `subagents/agent-{id}.meta.json` を走査し、agent_id → agentType マッピングを作る
   *   2) tool_calls JSON に Agent tool_use を持つ親メッセージから input.subagent_type を抽出
   * 既に値がある行は触らない（`WHERE subagent_type IS NULL`）。
   * @internal テスト用に projectsDir を差し替え可能。本番は `~/.claude/projects` を使用。
   */
  /** Step 1 of backfillSubagentType: scan meta.json files and build agent_id → agentType map. */
  private collectAgentTypeMap(baseDir: string): Map<string, string> {
    const agentTypeByAgentId = new Map<string, string>();
    let projectNames: string[];
    try {
      projectNames = fs.readdirSync(baseDir);
    } catch (e) {
      this.logger.warn(`[Migration] subagent_type_backfill_v1: cannot read projects dir ${baseDir}: ${e instanceof Error ? e.message : String(e)}`);
      return agentTypeByAgentId;
    }
    for (const projectName of projectNames) {
      const projectPath = path.join(baseDir, projectName);
      let sessionEntries: string[];
      try {
        if (!fs.statSync(projectPath).isDirectory()) continue;
        sessionEntries = fs.readdirSync(projectPath);
      } catch { continue; }
      for (const sessionEntry of sessionEntries) {
        this.collectAgentTypeMapForSession(agentTypeByAgentId, projectPath, sessionEntry);
      }
    }
    return agentTypeByAgentId;
  }

  private collectAgentTypeMapForSession(
    agentTypeByAgentId: Map<string, string>,
    projectPath: string,
    sessionEntry: string,
  ): void {
    const subagentDir = path.join(projectPath, sessionEntry, 'subagents');
    let metaFiles: string[];
    try {
      metaFiles = fs.readdirSync(subagentDir).filter((f) => f.endsWith('.meta.json'));
    } catch { return; }
    for (const metaFile of metaFiles) {
      const match = /^agent-(.+)\.meta\.json$/.exec(metaFile);
      if (!match) continue;
      const agentId = match[1];
      try {
        const raw = fs.readFileSync(path.join(subagentDir, metaFile), 'utf-8');
        const meta = JSON.parse(raw) as { agentType?: unknown };
        const agentType = typeof meta.agentType === 'string' && meta.agentType.length > 0 ? meta.agentType : null;
        if (agentType) agentTypeByAgentId.set(agentId, agentType);
      } catch (e) {
        this.logger.warn(`[Migration] subagent_type_backfill_v1: skip ${metaFile}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Step 2 of backfillSubagentType: UPDATE messages by agent_id in a single transaction. */
  private backfillSubagentTypeByAgentId(db: Database, agentTypeByAgentId: Map<string, string>, phase2Start: number): number {
    let metaUpdated = 0;
    db.run('BEGIN TRANSACTION');
    try {
      const updateByAgentId = db.prepare(
        'UPDATE messages SET subagent_type = ? WHERE agent_id = ? AND subagent_type IS NULL',
      );
      try {
        let processed = 0;
        for (const [agentId, agentType] of agentTypeByAgentId) {
          updateByAgentId.run([agentType, agentId]);
          metaUpdated++;
          processed++;
          if (processed % 500 === 0) {
            this.logger.info(`[Migration] subagent_type_backfill_v1: agent_id UPDATEs ${processed}/${agentTypeByAgentId.size} (${Date.now() - phase2Start}ms)`);
          }
        }
      } finally {
        updateByAgentId.free();
      }
      db.run('COMMIT');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (error_) { this.logger.error('[Migration] subagent_type_backfill_v1: ROLLBACK failed', error_); }
      throw e;
    }
    return metaUpdated;
  }

  /** Step 3 of backfillSubagentType: UPDATE parent messages that contain Agent tool_use calls. */
  private backfillSubagentTypeForParents(db: Database, candidateUuids: string[]): number {
    let parentUpdated = 0;
    if (candidateUuids.length === 0) return parentUpdated;
    db.run('BEGIN TRANSACTION');
    try {
      const selectStmt = db.prepare('SELECT tool_calls FROM messages WHERE uuid = ?');
      const updateParent = db.prepare('UPDATE messages SET subagent_type = ? WHERE uuid = ?');
      try {
        for (let i = 0; i < candidateUuids.length; i++) {
          const uuid = candidateUuids[i];
          selectStmt.bind([uuid]);
          try {
            if (selectStmt.step()) {
              const row = selectStmt.get();
              const toolCalls = row[0] as string | null;
              if (toolCalls) {
                const info = extractAgentInfo(toolCalls);
                if (info.subagentType) {
                  updateParent.run([info.subagentType, uuid]);
                  parentUpdated++;
                }
              }
            }
          } finally {
            selectStmt.reset();
          }
          if ((i + 1) % 500 === 0) {
            this.logger.info(`[Migration] subagent_type_backfill_v1: parent ${i + 1}/${candidateUuids.length} processed`);
          }
        }
      } finally {
        selectStmt.free();
        updateParent.free();
      }
      db.run('COMMIT');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (error_) { this.logger.error('[Migration] subagent_type_backfill_v1: ROLLBACK failed', error_); }
      throw e;
    }
    return parentUpdated;
  }

  private backfillSubagentType(projectsDir?: string): void {
    const db = this.ensureDb();
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'subagent_type_backfill_v1'");
    if (done[0]?.values?.length) return;

    const startedAt = Date.now();
    this.logger.info('[Migration] subagent_type_backfill_v1: starting...');

    // 性能上の必須: messages.agent_id にインデックスがないと UPDATE WHERE agent_id=? が
    // 毎回フルスキャン。1000+ meta.json × 数十万 messages で数億行スキャンになり数十分ハングする。
    db.run('CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id)');

    const baseDir = projectsDir ?? path.join(os.homedir(), '.claude', 'projects');

    // Step 1: meta.json を集約してメモリ上で agent_id → agentType マップを作る（fs IO のみ、SQL なし）
    const agentTypeByAgentId = this.collectAgentTypeMap(baseDir);
    this.logger.info(`[Migration] subagent_type_backfill_v1: collected ${agentTypeByAgentId.size} agent_id mappings (${Date.now() - startedAt}ms)`);

    // Step 2: 単一トランザクションで一括 UPDATE。インデックスありで O(log N)/UPDATE。
    const phase2Start = Date.now();
    const metaUpdated = this.backfillSubagentTypeByAgentId(db, agentTypeByAgentId, phase2Start);
    this.logger.info(`[Migration] subagent_type_backfill_v1: meta UPDATE done meta=${metaUpdated} (${Date.now() - phase2Start}ms)`);

    // Step 3: 親メッセージ側 (Agent tool_use を持つ assistant)。tool_calls JSON は大きいので
    // 先に uuid リストだけ取り出し、次に PK 経由で 1 行ずつ SELECT して逐次処理する。
    const phase3Start = Date.now();
    const uuidRes = db.exec(
      "SELECT uuid FROM messages WHERE subagent_type IS NULL AND tool_calls LIKE '%\"name\":\"Agent\"%'",
    );
    const candidateUuids = (uuidRes[0]?.values ?? []).map((r) => asText(r[0] ?? '')).filter(Boolean);
    this.logger.info(`[Migration] subagent_type_backfill_v1: ${candidateUuids.length} parent message candidates (${Date.now() - phase3Start}ms)`);

    const parentUpdated = this.backfillSubagentTypeForParents(db, candidateUuids);

    this.logger.info(
      `[Migration] subagent_type_backfill_v1: COMPLETED meta=${metaUpdated} parent=${parentUpdated} totalMs=${Date.now() - startedAt}`,
    );
    db.run("INSERT OR IGNORE INTO _migrations (key) VALUES ('subagent_type_backfill_v1')");
  }

  /**
   * tool_use_result の保存形式修正に伴い、既存データを再インポートする。
   * message_tool_calls を全削除し、sessions の file_size を 0 にリセットして
   * 次回 importAll で全セッションが再インポート＋再解析されるようにする。
   */
  private migrateToolUseResult(db: Database): void {
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');
    const done = db.exec("SELECT 1 FROM _migrations WHERE key = 'tool_use_result_fix'");
    if (done[0]?.values?.length) return;

    this.logger.info('[Migration] tool_use_result_fix: clearing message_tool_calls and resetting file sizes for full re-import');
    db.run('DELETE FROM message_tool_calls');
    db.run('UPDATE sessions SET file_size = 0');
    db.run("INSERT INTO _migrations (key) VALUES ('tool_use_result_fix')");
  }

  /**
   * 既存データの日時カラムをUTC ISO 8601に一括変換する。
   * 一度実行済みなら _migrations テーブルのフラグで二重実行を防止する。
   */
  private migrateTimestampsToUTC(db: Database): void {
    db.run('CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)');

    const done = db.exec(
      "SELECT 1 FROM _migrations WHERE key = 'timestamps_to_utc'",
    );
    if (done[0]?.values?.length) return;

    db.run('BEGIN TRANSACTION');
    try {
      // sessions: start_time, end_time, imported_at, commits_resolved_at
      const sessions = db.exec(
        'SELECT id, start_time, end_time, imported_at, commits_resolved_at FROM sessions',
      );
      if (sessions[0]?.values) {
        const stmt = db.prepare(
          'UPDATE sessions SET start_time = ?, end_time = ?, imported_at = ?, commits_resolved_at = ? WHERE id = ?',
        );
        for (const row of sessions[0].values) {
          stmt.run([
            toUTC(asText(row[1] ?? '')),
            toUTC(asText(row[2] ?? '')),
            toUTC(asText(row[3] ?? '')),
            row[4] ? toUTC(asText(row[4])) : null,
            String(row[0]),
          ]);
        }
        stmt.free();
      }

      // messages: timestamp
      const messages = db.exec('SELECT uuid, timestamp FROM messages');
      if (messages[0]?.values) {
        const stmt = db.prepare(
          'UPDATE messages SET timestamp = ? WHERE uuid = ?',
        );
        for (const row of messages[0].values) {
          stmt.run([toUTC(asText(row[1] ?? '')), asText(row[0])]);
        }
        stmt.free();
      }

      // session_commits: committed_at
      const commits = db.exec(
        'SELECT session_id, commit_hash, committed_at FROM session_commits',
      );
      if (commits[0]?.values) {
        const stmt = db.prepare(
          'UPDATE session_commits SET committed_at = ? WHERE session_id = ? AND commit_hash = ?',
        );
        for (const row of commits[0].values) {
          stmt.run([
            toUTC(asText(row[2] ?? '')),
            String(row[0]),
            String(row[1]),
          ]);
        }
        stmt.free();
      }

      db.run("INSERT INTO _migrations (key) VALUES ('timestamps_to_utc')");
      db.run('COMMIT');
    } catch (e) {
      console.error('[TrailDatabase] migrateTimestampsToUTC failed:', e);
      db.run('ROLLBACK');
    }
  }

  /**
   * 旧 trail_graphs テーブルのデータを current_graphs / release_graphs に移行して破棄する。
   * - id='current' 行 → current_graphs（commit_id は空文字で初期化）
   * - それ以外で releases.tag に存在するもの → release_graphs
   * - releases に存在しない孤児タグはログ警告のみで破棄
   */
  private migrateTrailGraphsTable(db: Database): void {
    const exists = db.exec(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='trail_graphs'",
    );
    if (!exists[0]?.values?.length) return;

    try {
      // 旧 id='current' 行は repo_name を特定できないため current_graphs には移行せず破棄する。
      // ワークスペースで次回 C4 解析を実行した時点で新規登録される。
      const droppedCurrentRes = db.exec(
        "SELECT COUNT(*) FROM trail_graphs WHERE id = 'current'",
      );
      const droppedCurrent = Number(droppedCurrentRes[0]?.values?.[0]?.[0] ?? 0);

      const releaseTagsRes = db.exec('SELECT tag FROM releases');
      const knownTags = new Set<string>(
        releaseTagsRes[0]?.values?.map((r) => String(r[0])) ?? [],
      );

      const othersRes = db.exec(
        "SELECT id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at FROM trail_graphs WHERE id <> 'current'",
      );
      const orphans: string[] = [];
      for (const row of othersRes[0]?.values ?? []) {
        const tag = String(row[0]);
        if (!knownTags.has(tag)) {
          orphans.push(tag);
          continue;
        }
        // flip 後 release_graphs は release_id PK。tag を release_id へ解決して保存する。
        const releaseId = this.releaseIdForTag(db, tag);
        if (releaseId == null) {
          orphans.push(tag);
          continue;
        }
        db.run(
          `INSERT OR REPLACE INTO release_graphs
             (release_id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            releaseId,
            asText(row[1] ?? ''),
            asText(row[2] ?? ''),
            asText(row[3] ?? ''),
            asText(row[4] ?? ''),
            asText(row[5] ?? ''),
          ],
        );
      }

      if (orphans.length > 0) {
        this.logger.warn(
          `migrateTrailGraphsTable: dropped ${orphans.length} orphan tag(s) not present in releases: ${orphans.join(', ')}`,
        );
      }

      db.run('DROP TABLE trail_graphs');
      this.logger.info(
        `migrateTrailGraphsTable: migrated trail_graphs → release_graphs (releases=${(othersRes[0]?.values?.length ?? 0) - orphans.length}, dropped_current=${droppedCurrent})`,
      );
      // sql.js はインメモリなので、マイグレーション結果をディスクに即時永続化する
      this.save();
    } catch (e) {
      this.logger.error('migrateTrailGraphsTable failed', e);
    }
  }

  /**
   * current_graphs のスキーマが旧版（id 列 PK）だった場合、テーブルを破棄して新版で作り直す。
   * データは空のため内容移行は行わない（ユーザー指示で事前クリア済み）。
   */
  /**
   * file_analysis テーブルが旧スキーマ（repo を一意に識別できない退化状態）で存在する場合に DROP して
   * 再作成を促す。
   *
   * 当初は「repo_name 列が無い = 退化」と判定していたが、Phase H-3 で current_* の repo_name 列を
   * 物理撤去したため、その判定では撤去済の正しい新スキーマ (repo_id PK) まで誤って DROP してしまう。
   * 退化判定は repo を一意に復元できる手掛かりが何も無い場合に限定する。
   * - current_*_analysis: repo_id で repo を識別する (Phase H-3 で repo_name 撤去)。
   * - release_*_analysis: Phase H-5 で repo_name を撤去したため repo_id も repo_name も持たない。代わりに
   *   release_id FK が (repo, tag) を一意に決める。release_id を持てば正しい新スキーマなので DROP しない
   *   (release_id を判定条件に含めないと、撤去済の正しい release_*_analysis を誤って DROP してしまう)。
   */
  private migrateFileAnalysisSchema(db: Database): void {
    const tables = [
      'current_file_analysis',
      'release_file_analysis',
      'current_function_analysis',
      'release_function_analysis',
    ];
    for (const table of tables) {
      const exists = db.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`);
      if (!exists[0]?.values?.length) continue;
      const info = db.exec(`PRAGMA table_info(${table})`);
      const columns = info[0]?.values?.map((r) => String(r[1])) ?? [];
      // repo_name / repo_id / release_id のいずれかで repo 帰属を識別できれば正しいスキーマ。
      // - current_* は repo_id (Phase H-3 撤去後)。- release_* は release_id (Phase H-5 撤去後・repo_id 無し)。
      // どの手掛かりも無いものだけが退化スキーマとして DROP 対象。
      if (
        columns.includes('repo_name') ||
        columns.includes('repo_id') ||
        columns.includes('release_id')
      ) {
        continue;
      }
      try {
        db.run(`DROP TABLE ${table}`);
        this.logger.info(`migrateFileAnalysisSchema: dropped legacy ${table} (no repo_name / repo_id / release_id) for recreation`);
        this.save();
      } catch (e) {
        this.logger.error(`migrateFileAnalysisSchema: failed to drop ${table}`, e);
      }
    }
  }

  /**
   * current_graphs のスキーマが旧版（id 列 PK で repo を識別できない退化状態）だった場合、テーブルを
   * 破棄して新版で作り直す。データは空のため内容移行は行わない。
   *
   * Phase H-3 で repo_name 列を物理撤去したため、「repo_name 列が無い = 退化」では撤去済の正しい
   * 新スキーマ (repo_id PK) まで誤って DROP してしまう。repo_id も repo_name も無い (= 旧 id PK) 場合
   * のみ DROP する。
   */
  private migrateCurrentGraphsSchema(db: Database): void {
    const exists = db.exec(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='current_graphs'",
    );
    if (!exists[0]?.values?.length) return;

    const info = db.exec('PRAGMA table_info(current_graphs)');
    const columns = info[0]?.values?.map((r) => String(r[1])) ?? [];
    if (columns.includes('repo_name') || columns.includes('repo_id')) return;

    try {
      db.run('DROP TABLE current_graphs');
      this.logger.info('migrateCurrentGraphsSchema: dropped legacy current_graphs (id PK・no repo_id) for recreation with repo_id PK');
      this.save();
    } catch (e) {
      this.logger.error('migrateCurrentGraphsSchema failed', e);
    }
  }

  /**
   * SQLite の DATE() に渡すローカル TZ オフセット文字列を返す。
   * WSL 上の Node プロセスが UTC で動作し、ユーザーの期待する JST と一致しない
   * 問題を避けるため、IANA タイムゾーンベースで計算する（dateUtils に委譲）。
   */
  private getLocalTzOffset(): string {
    return getSqliteTzOffset();
  }

  /** 全セッションの全アシスタントメッセージ（tool_calls あり）を取得する */
  getAllAssistantMessages(): Pick<MessageRow, 'tool_calls' | 'output_tokens'>[] {
    try {
      const db = this.ensureDb();
      const result = db.exec(
        `SELECT tool_calls, output_tokens FROM messages WHERE type = 'assistant' AND tool_calls IS NOT NULL`,
      );
      if (!result[0]) return [];
      return result[0].values.map(row => ({
        tool_calls: row[0] != null ? asText(row[0]) : null,
        output_tokens: Number(row[1]),
      }));
    } catch (err) {
      this.logger.warn(`getAllAssistantMessages failed: ${(err as Error).message}`);
      return [];
    }
  }

  getSessionCosts(sessionId: string): readonly {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd
       FROM session_costs WHERE session_id = ?`,
      [sessionId],
    );
    if (!result[0]) return [];
    return result[0].values.map((r) => ({
      model: r[0] as string,
      input_tokens: r[1] as number,
      output_tokens: r[2] as number,
      cache_read_tokens: r[3] as number,
      cache_creation_tokens: r[4] as number,
      estimated_cost_usd: r[5] as number,
    }));
  }

  getAllSessionCosts(): readonly {
    session_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[] {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd
       FROM session_costs`,
    );
    if (!result[0]) return [];
    return result[0].values.map((r) => ({
      session_id: r[0] as string,
      model: r[1] as string,
      input_tokens: r[2] as number,
      output_tokens: r[3] as number,
      cache_read_tokens: r[4] as number,
      cache_creation_tokens: r[5] as number,
      estimated_cost_usd: r[6] as number,
    }));
  }

  getAllDailyCounts(): readonly {
    date: string;
    kind: string;
    key: string;
    count: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    duration_ms: number;
    estimated_cost_usd: number;
  }[] {
    const db = this.ensureDb();
    const result = db.exec('SELECT * FROM daily_counts ORDER BY date, kind, key');
    if (!result[0]) return [];
    const { columns, values } = result[0];
    return values.map(row =>
      Object.fromEntries(columns.map((c, i) => [c, row[i]]))
    ) as unknown as ReturnType<TrailDatabase['getAllDailyCounts']>;
  }

  getAllMessageToolCalls(cutoff?: string): readonly {
    id: number;
    session_id: string;
    message_uuid: string;
    turn_index: number;
    call_index: number;
    tool_name: string;
    file_path: string | null;
    command: string | null;
    skill_name: string | null;
    model: string | null;
    is_sidechain: number;
    turn_exec_ms: number | null;
    has_thinking: number;
    is_error: number;
    error_type: string | null;
    timestamp: string;
  }[] {
    const db = this.ensureDb();
    const result = cutoff
      ? db.exec('SELECT * FROM message_tool_calls WHERE timestamp >= ? ORDER BY id ASC', [cutoff])
      : db.exec('SELECT * FROM message_tool_calls ORDER BY id ASC');
    if (!result[0]) return [];
    const { columns, values } = result[0];
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]]))) as unknown as ReturnType<TrailDatabase['getAllMessageToolCalls']>;
  }

  /**
   * LEP `CostRebuilder` (Step 2c) 用 public wrapper。Wave 末端で 1 回呼ぶ想定。
   */
  rebuildSessionCostsPublic(): void {
    this.rebuildSessionCosts();
  }

  /**
   * LEP `CountsRebuilder` (Step 2c) 用 public wrapper (daily counts + session stats)。
   * Wave 末端で 1 回呼ぶ想定。
   */
  rebuildDailyCountsPublic(): void {
    this.rebuildDailyCounts();
  }

  /** LEP `CountsRebuilder` (Step 2c) 用 public wrapper。Wave 末端で 1 回呼ぶ想定。 */
  rebuildSessionStatsPublic(): void {
    this.rebuildSessionStats();
  }

  /**
   * LEP `DoraMetricsAggregator` (Step 4a) 用: DORA 集計の入力 release を返す。
   *
   * `released_at` が NULL / 空文字の release は除外する (集計対象外)。
   * 単純な範囲スキャン (code-quality.md §16) で、月次集計・lead time の中央値は
   * 呼び出し側 (aggregator) で TS で算出する。
   */
  getDoraReleases(): DoraReleaseInput[] {
    const db = this.ensureDb();
    // Phase H-5: releases.repo_name 列は撤去済。repos を LEFT JOIN して repo_name を射影する
    // (repo_id=0 sentinel / NULL など未解決は '' = 旧 repo_name='' と等価・結果キー・順序は不変)。
    const result = db.exec(
      `SELECT rel.tag, rel.released_at, COALESCE(r.repo_name, '') AS repo_name
       FROM releases rel
       LEFT JOIN repos r ON r.repo_id = rel.repo_id
       WHERE rel.released_at IS NOT NULL AND rel.released_at <> ''
       ORDER BY rel.released_at`,
    );
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      tag: asText(row[0] ?? ''),
      releasedAt: asText(row[1] ?? ''),
      repoName: asText(row[2] ?? ''),
    }));
  }

  /**
   * LEP `DoraMetricsAggregator` (Step 4a) 用: lead time 算出の入力 commit を返す。
   *
   * `session_commits` を commit_hash × repo_name で重複排除し、`committed_at` が
   * NULL / 空文字のものは除外する。複数 session が同一 commit を参照しても 1 件にする。
   */
  getDoraCommits(): DoraCommitInput[] {
    const db = this.ensureDb();
    // Phase H-4: session_commits.repo_name 列は撤去済。dedup は repo_id × commit_hash で行い
    // (repo_id は repo_name と 1:1)、repo_name は repos を LEFT JOIN して射影する (結果キー・意味は不変)。
    const result = db.exec(
      `SELECT sc.commit_hash, MIN(sc.committed_at) AS committed_at, COALESCE(r.repo_name, '') AS repo_name
       FROM session_commits sc
       LEFT JOIN repos r ON r.repo_id = sc.repo_id
       WHERE sc.committed_at IS NOT NULL AND sc.committed_at <> ''
       GROUP BY sc.repo_id, sc.commit_hash
       ORDER BY committed_at`,
    );
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      commitHash: asText(row[0] ?? ''),
      committedAt: asText(row[1] ?? ''),
      repoName: asText(row[2] ?? ''),
    }));
  }

  /**
   * LEP `DoraMetricsAggregator` (Step 4a) 用: dora_metrics を洗い替えで更新する。
   *
   * DORA 指標は毎 run 全データから再算出するため、差分でなく全 DELETE → INSERT の
   * wash-away 方式 (code-quality.md §21.2 と同方針)。トランザクションで原子的に置換する。
   */
  replaceDoraMetrics(rows: readonly DoraMetricRow[]): void {
    this.withTransaction((db) => {
      db.run('DELETE FROM dora_metrics');
      const stmt = db.prepare(
        `INSERT INTO dora_metrics
           (repo_id, period, deployment_frequency, lead_time_hours, computed_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      try {
        for (const r of rows) {
          // Phase F: 外部 API は repo_name を受けるが、内部で repoIdForName により repo_id を
          // 解決して保存する (新 PK は (repo_id, period))。repoIdForName は upsert で repos に登録する。
          // Phase H-1: repo_name 列は撤去済。repo_name は repos 経由で復元する (read で JOIN)。
          const repoId = this.repoIdForName(r.repoName);
          stmt.run([repoId, r.period, r.deploymentFrequency, r.leadTimeHours, r.computedAt]);
        }
      } finally {
        stmt.free();
      }
    });
  }

  /**
   * LEP `PrReviewImporter` (Step 4c) 用: 既存 PR review の body_hash を返す (なければ null)。
   * Ingester が再 emit した review が未変更かを判定し、冪等に skip するために使う。
   */
  getPrReviewBodyHash(reviewId: string): string | null {
    const db = this.ensureDb();
    const result = db.exec('SELECT body_hash FROM pr_reviews WHERE review_id = ?', [reviewId]);
    const row = result[0]?.values[0];
    return row ? asText(row[0] ?? '') : null;
  }

  /**
   * LEP `PrReviewImporter` (Step 4c) 用: PR review 1 件を upsert する (冪等)。
   * pr_reviews を INSERT OR REPLACE し、pr_review_comments を洗い替えする。
   */
  upsertPrReview(review: PrReviewUpsert): void {
    this.withTransaction((db) => {
      // Phase F: 外部 API は repo_name を受けるが、内部で repoIdForName により repo_id を解決して
      // 保存する (PK は review_id のまま不変・repo_id は additive 列)。
      // Phase H-1: repo_name 列は撤去済。repo_name は repos 経由で復元する (read で JOIN)。
      const repoId = this.repoIdForName(review.repoName);
      db.run(
        `INSERT OR REPLACE INTO pr_reviews
           (review_id, repo_id, pr_number, author, state, submitted_at, body, body_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          review.reviewId,
          repoId,
          review.prNumber,
          review.author,
          review.state,
          review.submittedAt,
          review.body,
          review.bodyHash,
        ],
      );
      db.run('DELETE FROM pr_review_comments WHERE review_id = ?', [review.reviewId]);
      const stmt = db.prepare(
        `INSERT INTO pr_review_comments (review_id, comment_index, file_path, line_number, body)
         VALUES (?, ?, ?, ?, ?)`,
      );
      try {
        review.comments.forEach((c, i) => {
          stmt.run([review.reviewId, i, c.path, c.line, c.body]);
        });
      } finally {
        stmt.free();
      }
    });
  }

  /**
   * LEP `PrReviewFindingAnalyzer` (Step 4c) 用: review 1 件の body + comments を返す
   * (finding 抽出入力)。存在しなければ null。
   */
  getPrReviewDetail(reviewId: string): PrReviewDetail | null {
    const db = this.ensureDb();
    // Phase H-1: repo_name は pr_reviews に無い。repos を LEFT JOIN して射影する (結果キーは不変)。
    // 未解決 repo_id (0/NULL) 行も相関から落とさないため LEFT JOIN + COALESCE(r.repo_name, '')。
    const head = db.exec(
      `SELECT COALESCE(r.repo_name, '') AS repo_name, p.pr_number, p.state, p.body
       FROM pr_reviews p LEFT JOIN repos r ON r.repo_id = p.repo_id WHERE p.review_id = ?`,
      [reviewId],
    );
    const row = head[0]?.values[0];
    if (!row) return null;
    const cres = db.exec(
      'SELECT file_path, line_number, body FROM pr_review_comments WHERE review_id = ? ORDER BY comment_index',
      [reviewId],
    );
    const comments: PrReviewCommentInput[] = (cres[0]?.values ?? []).map((c) => ({
      path: asText(c[0] ?? ''),
      line: c[1] == null ? null : Number(c[1]),
      body: asText(c[2] ?? ''),
    }));
    return {
      reviewId,
      repoName: asText(row[0] ?? ''),
      prNumber: Number(row[1] ?? 0),
      state: asText(row[2] ?? ''),
      body: asText(row[3] ?? ''),
      comments,
    };
  }

  /** CrossSourceCorrelator (Step 4d) 用: 全 PR review を返す。 */
  getPrReviews(): PrReviewRow[] {
    const db = this.ensureDb();
    // Phase H-1: repo_name は pr_reviews に無い。repos を LEFT JOIN して射影する (結果キーは不変)。
    // 未解決 repo_id (0/NULL) 行も相関から落とさないため LEFT JOIN + COALESCE(r.repo_name, '')。
    const result = db.exec(
      `SELECT p.review_id, COALESCE(r.repo_name, '') AS repo_name, p.pr_number, p.author, p.state, p.submitted_at, p.body_hash
       FROM pr_reviews p LEFT JOIN repos r ON r.repo_id = p.repo_id ORDER BY p.submitted_at`,
    );
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      reviewId: asText(row[0] ?? ''),
      repoName: asText(row[1] ?? ''),
      prNumber: Number(row[2] ?? 0),
      author: asText(row[3] ?? ''),
      state: asText(row[4] ?? ''),
      submittedAt: asText(row[5] ?? ''),
      bodyHash: asText(row[6] ?? ''),
    }));
  }

  /**
   * LEP `PrReviewFindingAnalyzer` (Step 4c) 用: 指定 review の finding を洗い替えする。
   * memory_review_findings とは独立した pr_review_findings に書き込む (source_type enum 不変)。
   */
  replacePrReviewFindings(reviewId: string, findings: readonly PrReviewFindingRow[]): void {
    this.withTransaction((db) => {
      db.run('DELETE FROM pr_review_findings WHERE review_id = ?', [reviewId]);
      const stmt = db.prepare(
        `INSERT INTO pr_review_findings
           (finding_id, review_id, file_path, line_number, severity, category, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      try {
        for (const f of findings) {
          stmt.run([
            f.findingId,
            f.reviewId,
            f.filePath,
            f.lineNumber,
            f.severity,
            f.category,
            f.body,
            f.createdAt,
          ]);
        }
      } finally {
        stmt.free();
      }
    });
  }

  /** CrossSourceCorrelator (Step 4d) / テスト用: pr_review_findings を返す (review 指定で絞込)。 */
  getPrReviewFindings(reviewId?: string): PrReviewFindingRow[] {
    const db = this.ensureDb();
    const result = reviewId
      ? db.exec(
          `SELECT finding_id, review_id, file_path, line_number, severity, category, body, created_at
           FROM pr_review_findings WHERE review_id = ? ORDER BY finding_id`,
          [reviewId],
        )
      : db.exec(
          `SELECT finding_id, review_id, file_path, line_number, severity, category, body, created_at
           FROM pr_review_findings ORDER BY finding_id`,
        );
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      findingId: asText(row[0] ?? ''),
      reviewId: asText(row[1] ?? ''),
      filePath: asText(row[2] ?? ''),
      lineNumber: row[3] == null ? null : Number(row[3]),
      severity: row[4] == null ? null : (asText(row[4]) as 'error' | 'warn' | 'info'),
      category: row[5] == null ? null : asText(row[5]),
      body: asText(row[6] ?? ''),
      createdAt: asText(row[7] ?? ''),
    }));
  }

  /**
   * CrossSourceCorrelator (Step 4d) 用: committed_at が有効な session_commits を返す。
   * `sinceCommittedAt` 指定時は `committed_at >= ?` で範囲を絞り (idx_session_commits_committed_at で
   * 範囲スキャン)、相関の時間窓外の古い commit を全件ロードしないようにする。
   */
  getCorrelationSessionCommits(sinceCommittedAt?: string): CorrelationSessionCommit[] {
    const db = this.ensureDb();
    // Phase H-4: session_commits.repo_name 列は撤去済。repos を LEFT JOIN して repo_name を射影する
    // (repo_id=0 sentinel など未解決は '' = 旧 repo_name='' と等価・結果キーは不変)。
    const base = `SELECT sc.session_id, sc.commit_hash, sc.committed_at, COALESCE(r.repo_name, '') AS repo_name
       FROM session_commits sc
       LEFT JOIN repos r ON r.repo_id = sc.repo_id
       WHERE sc.committed_at IS NOT NULL AND sc.committed_at <> ''`;
    const result = sinceCommittedAt
      ? db.exec(`${base} AND sc.committed_at >= ?`, [sinceCommittedAt])
      : db.exec(base);
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      sessionId: asText(row[0] ?? ''),
      commitHash: asText(row[1] ?? ''),
      committedAt: asText(row[2] ?? ''),
      repoName: asText(row[3] ?? ''),
    }));
  }

  /**
   * CrossSourceCorrelator (Step 4d) 用: 指定 file_path に触れた commit_files を返す。
   * file_path で絞ることで全件スキャンを避ける (correlation 対象は finding のファイルのみ)。
   * `filePaths` が空なら何も返さない。
   */
  getCorrelationCommitFiles(filePaths: readonly string[]): CorrelationCommitFile[] {
    if (filePaths.length === 0) return [];
    const db = this.ensureDb();
    const placeholders = filePaths.map(() => '?').join(', ');
    // Phase H-4: commit_files.repo_name 列は撤去済。repos を LEFT JOIN して repo_name を射影する
    // (repo_id=0 sentinel など未解決は '' = 旧 repo_name='' と等価・結果キーは不変)。
    const result = db.exec(
      `SELECT cf.commit_hash, cf.file_path, COALESCE(r.repo_name, '') AS repo_name
       FROM commit_files cf
       LEFT JOIN repos r ON r.repo_id = cf.repo_id
       WHERE cf.file_path IN (${placeholders})`,
      filePaths,
    );
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      commitHash: asText(row[0] ?? ''),
      filePath: asText(row[1] ?? ''),
      repoName: asText(row[2] ?? ''),
    }));
  }

  /** CrossSourceCorrelator (Step 4d) 用: cross_source_correlations を洗い替えで更新する。 */
  replaceCrossSourceCorrelations(rows: readonly CrossSourceCorrelationRow[]): void {
    this.withTransaction((db) => {
      db.run('DELETE FROM cross_source_correlations');
      const stmt = db.prepare(
        `INSERT INTO cross_source_correlations
           (correlation_type, repo_id, source_a_kind, source_a_id, source_b_kind, source_b_id, confidence, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      try {
        for (const r of rows) {
          // Phase F: 外部 API は repo_name を受けるが、内部で repoIdForName により repo_id を解決して
          // 保存する (PK は (correlation_type, source_a_id, source_b_id) のまま不変・repo_id は additive)。
          // source_b_id に release tag を保存している箇所でも repo_id 列でリポを区別できるようにする。
          // Phase H-1: repo_name 列は撤去済。repo_name は repos 経由で復元する (read で LEFT JOIN)。
          const repoId = this.repoIdForName(r.repoName);
          stmt.run([
            r.correlationType,
            repoId,
            r.sourceAKind,
            r.sourceAId,
            r.sourceBKind,
            r.sourceBId,
            r.confidence,
            r.computedAt,
          ]);
        }
      } finally {
        stmt.free();
      }
    });
  }

  /** テスト / 診断用: cross_source_correlations を返す。 */
  getCrossSourceCorrelations(): CrossSourceCorrelationRow[] {
    const db = this.ensureDb();
    // Phase H-1: repo_name は cross_source_correlations に無い。repo_id は NULL-able のため
    // LEFT JOIN repos で射影し、未解決 (repo_id NULL/未登録) は '' とする (結果キー・値は不変)。
    const result = db.exec(
      `SELECT c.correlation_type, COALESCE(r.repo_name, '') AS repo_name, c.source_a_kind,
              c.source_a_id, c.source_b_kind, c.source_b_id, c.confidence, c.computed_at
       FROM cross_source_correlations c LEFT JOIN repos r USING(repo_id)
       ORDER BY c.correlation_type, c.source_a_id, c.source_b_id`,
    );
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      correlationType: asText(row[0] ?? '') as CrossSourceCorrelationRow['correlationType'],
      repoName: asText(row[1] ?? ''),
      sourceAKind: asText(row[2] ?? '') as CrossSourceAKind,
      sourceAId: asText(row[3] ?? ''),
      sourceBKind: asText(row[4] ?? '') as CrossSourceBKind,
      sourceBId: asText(row[5] ?? ''),
      confidence: asText(row[6] ?? 'low') as 'high' | 'medium' | 'low',
      computedAt: asText(row[7] ?? ''),
    }));
  }

  /**
   * LEP `BehaviorAnalyzer` (Step 2c) 用 public wrapper。
   * 指定 session に対して `ClaudeCodeBehaviorAnalyzer.analyze` を実行する。
   */
  runBehaviorAnalysis(sessionId: string): void {
    const db = this.ensureDb();
    const analyzer = new ClaudeCodeBehaviorAnalyzer();
    analyzer.analyze(sessionId, db);
  }

  /**
   * LEP `CommitFilesBackfiller` (Step 2d) 用 public wrapper。
   * `_migrations.commit_files_backfill_v2` フラグで一度きり実行を維持する。
   */
  backfillCommitFilesPublic(gitRoot: string, onProgress?: (msg: string) => void): void {
    this.backfillCommitFiles(gitRoot, onProgress);
  }

  /**
   * LEP `SubagentTypeBackfiller` (Step 2d) 用 public wrapper。
   * `_migrations.subagent_type_backfill_v1` フラグで一度きり実行を維持する。
   */
  backfillSubagentTypePublic(projectsDir?: string): void {
    this.backfillSubagentType(projectsDir);
  }

  /**
   * LEP `MessageCommitMatcher` (Step 2d) 用 public メソッド。
   * 既存 importAll Phase 8 の message_commits backfill ロジックを切り出したもの。
   * `message_commits_resolved_at` が NULL のセッションについて、JSONL を読み直して
   * commit ↔ message のマッチを再構築する。
   *
   * @returns backfill した message_commits 件数
   */
  backfillMessageCommits(onProgress?: (msg: string) => void): number {
    const unresolvedSessions = this.getUnresolvedMessageCommitSessions();
    let messageCommitsBackfilled = 0;
    for (const { sessionId, filePath } of unresolvedSessions) {
      try {
        const messages = JsonlSessionReader.loadFromFile(filePath);
        const rawCommits = this.getSessionCommits(sessionId);
        const commits = rawCommits.map((c) => ({
          commitHash: c.commit_hash,
          commitMessage: c.commit_message,
          author: c.author,
          committedAt: c.committed_at,
          isAiAssisted: c.is_ai_assisted === 1,
          filesChanged: c.files_changed,
          linesAdded: c.lines_added,
          linesDeleted: c.lines_deleted,
          repoName: c.repo_name ?? '',
        }));
        const matches = matchCommitsToMessages(messages, commits);
        const now = new Date().toISOString();
        for (const m of matches) {
          this.insertMessageCommit({
            messageUuid: m.messageUuid,
            sessionId,
            commitHash: m.commitHash,
            detectedAt: now,
            matchConfidence: m.matchConfidence,
          });
        }
        this.markMessageCommitsResolved(sessionId, now);
        messageCommitsBackfilled += matches.length;
      } catch (e) {
        this.logger.error(`Backfill failed for session ${sessionId}`, e);
      }
    }
    onProgress?.(`Backfilled ${messageCommitsBackfilled} message_commits`);
    return messageCommitsBackfilled;
  }

  /** Delete and rebuild session_costs from all messages. */
  private rebuildSessionCosts(): void {
    const db = this.ensureDb();
    db.run('DELETE FROM session_costs');

    const result = db.exec(
      `SELECT m.session_id, COALESCE(m.model,''), s.source,
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(cache_creation_tokens)
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
       GROUP BY m.session_id, m.model, s.source`,
    );
    const stmt = db.prepare(INSERT_SESSION_COST);
    for (const row of result[0]?.values ?? []) {
      const sid = String(row[0]); const m = String(row[1]); const source = String(row[2]) as PricingSource;
      const inp = Number(row[3]); const outp = Number(row[4]);
      const cr = Number(row[5]); const cc = Number(row[6]);
      const billingModel = resolvePricingModelName(m, source);
      stmt.run([sid, billingModel, inp, outp, cr, cc, estimateCost(m, inp, outp, cr, cc, source)]);
    }
    stmt.free();
  }

  /**
   * Populate per-session pre-aggregated stat columns (peak_context_tokens,
   * initial_context_tokens, git_branch, interruption_reason, interruption_context_tokens)
   * in a single pass. Avoids expensive per-read GROUP BY scans over messages.
   */
  private rebuildSessionStats(): void {
    const db = this.ensureDb();

    // Peak context + initial context (cache_creation_tokens of first assistant message)
    db.run(
      `UPDATE sessions SET
         peak_context_tokens = (
           SELECT MAX(COALESCE(m.input_tokens, 0) + COALESCE(m.cache_read_tokens, 0) + COALESCE(m.cache_creation_tokens, 0))
           FROM messages m WHERE m.session_id = sessions.id
         ),
         initial_context_tokens = (
           SELECT COALESCE(m.cache_creation_tokens, 0)
           FROM messages m
           WHERE m.session_id = sessions.id AND m.type = 'assistant'
           ORDER BY m.timestamp ASC LIMIT 1
         ),
         git_branch = (
           SELECT m.git_branch FROM messages m
           WHERE m.session_id = sessions.id AND m.git_branch IS NOT NULL AND m.git_branch != ''
           ORDER BY m.rowid ASC LIMIT 1
         )`,
    );

    // Interruption detection:
    //   1) last assistant has stop_reason='max_tokens' → max_tokens
    //   2) last non-meta message is 'user' (no assistant response follows) → no_response
    db.run(
      `UPDATE sessions SET
         interruption_reason = CASE
           WHEN (SELECT m.stop_reason FROM messages m
                 WHERE m.session_id = sessions.id AND m.type = 'assistant' AND m.is_meta = 0
                 ORDER BY m.timestamp DESC LIMIT 1) = 'max_tokens' THEN 'max_tokens'
           WHEN (SELECT m.type FROM messages m
                 WHERE m.session_id = sessions.id AND m.is_meta = 0 AND m.type IN ('user','assistant')
                 ORDER BY m.timestamp DESC LIMIT 1) = 'user' THEN 'no_response'
           ELSE NULL
         END,
         interruption_context_tokens = COALESCE(
           (SELECT COALESCE(m.input_tokens, 0) + COALESCE(m.cache_read_tokens, 0) + COALESCE(m.cache_creation_tokens, 0)
            FROM messages m
            WHERE m.session_id = sessions.id AND m.type = 'assistant' AND m.is_meta = 0
            ORDER BY m.timestamp DESC LIMIT 1),
           0
         )`,
    );

    // 自動 /compact 検出: 連続 assistant ターンで cacheRead が 50K 以上から 70% 以上減少した回数。
    // LAG ウィンドウ関数で前ターンの cache_read_tokens を取得して比較する。
    db.run(
      `UPDATE sessions SET compact_count = COALESCE((
         SELECT COUNT(*) FROM (
           SELECT cache_read_tokens,
                  LAG(cache_read_tokens) OVER (ORDER BY timestamp ASC) AS prev_cr
           FROM messages
           WHERE session_id = sessions.id AND type = 'assistant' AND is_meta = 0
         ) WHERE prev_cr >= 50000 AND cache_read_tokens <= prev_cr * 0.3
       ), 0)`,
    );

    db.run(
      `UPDATE sessions SET
         sub_agent_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND tool_name = 'Agent'
         ), 0),
         error_count = COALESCE((
           SELECT COUNT(*) FROM message_tool_calls
           WHERE session_id = sessions.id AND is_error = 1
         ), 0),
         assistant_message_count = COALESCE((
           SELECT COUNT(*) FROM messages
           WHERE session_id = sessions.id AND type = 'assistant' AND is_meta = 0
         ), 0)`,
    );
  }

  /**
   * Delete and rebuild daily_counts for all 6 kinds in a single pass.
   * kinds: cost_actual / cost_skill / tool / skill / error / model
   */
  private rebuildDailyCounts(): void {
    const db = this.ensureDb();
    const tzOffset = this.getLocalTzOffset();

    db.run('DELETE FROM daily_counts');

    const INSERT_DC = `INSERT INTO daily_counts
      (date, kind, key, count, tokens, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, duration_ms, estimated_cost_usd)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(date, kind, key) DO UPDATE SET
        count = daily_counts.count + excluded.count,
        tokens = daily_counts.tokens + excluded.tokens,
        input_tokens = daily_counts.input_tokens + excluded.input_tokens,
        output_tokens = daily_counts.output_tokens + excluded.output_tokens,
        cache_read_tokens = daily_counts.cache_read_tokens + excluded.cache_read_tokens,
        cache_creation_tokens = daily_counts.cache_creation_tokens + excluded.cache_creation_tokens,
        duration_ms = daily_counts.duration_ms + excluded.duration_ms,
        estimated_cost_usd = daily_counts.estimated_cost_usd + excluded.estimated_cost_usd`;
    const stmt = db.prepare(INSERT_DC);

    // start_time が空文字 / NULL のセッションは DATE() が NULL を返し、
    // sql.js → JS で String(null) === 'null' となって daily_counts.date GLOB CHECK を
    // 違反させる。日次集計から除外する。
    const SESSION_DATE_FILTER = "s.start_time IS NOT NULL AND s.start_time != ''";

    // YYYY-MM-DD 以外の date を弾く defense-in-depth ガード。
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    let droppedDates = 0;
    const runWithDateGuard = (date: string, params: readonly (string | number)[]): void => {
      if (!DATE_RE.test(date)) {
        droppedDates++;
        return;
      }
      stmt.run([date, ...params]);
    };

    // ── kind='cost_actual' : assistant メッセージ日次トークン・コスト（session start_time 基準）──
    const actual = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}'), COALESCE(m.model,''), s.source,
        SUM(input_tokens), SUM(output_tokens),
        SUM(cache_read_tokens), SUM(cache_creation_tokens)
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant' AND ${SESSION_DATE_FILTER}
       GROUP BY DATE(s.start_time, '${tzOffset}'), m.model, s.source`,
    );
    for (const row of actual[0]?.values ?? []) {
      const d = asText(row[0] ?? ''); const m = asText(row[1]); const source = asText(row[2]) as PricingSource;
      const inp = Number(row[3]); const outp = Number(row[4]);
      const cr = Number(row[5]); const cc = Number(row[6]);
      const billingModel = resolvePricingModelName(m, source);
      runWithDateGuard(d, ['cost_actual', billingModel, 0, 0, inp, outp, cr, cc, 0, estimateCost(m, inp, outp, cr, cc, source)]);
    }

    // Auto-register new skills that are not yet in skill_models
    db.run(
      `INSERT OR IGNORE INTO skill_models (skill, recommended_model)
       SELECT DISTINCT m.skill, 'sonnet'
       FROM messages m
       WHERE m.skill IS NOT NULL
         AND m.skill NOT IN (SELECT skill FROM skill_models)`,
    );

    // ── kind='cost_skill' : スキル推奨モデルでの仮想コスト（session start_time 基準）──
    const skill = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}'),
        COALESCE(sm.recommended_model, 'sonnet'),
        COUNT(*) AS msg_count,
        SUM(a.input_tokens), SUM(a.output_tokens),
        SUM(a.cache_read_tokens), SUM(a.cache_creation_tokens)
       FROM messages a
       JOIN sessions s ON s.id = a.session_id
       LEFT JOIN skill_models_resolved sm ON a.skill = sm.skill
       WHERE a.type = 'assistant' AND ${SESSION_DATE_FILTER}
       GROUP BY DATE(s.start_time, '${tzOffset}'),
         COALESCE(sm.recommended_model, 'sonnet')`,
    );
    for (const row of skill[0]?.values ?? []) {
      const d = asText(row[0] ?? ''); const m = asText(row[1]);
      const cnt = Number(row[2]);
      const inp = Number(row[3]); const outp = Number(row[4]);
      const cr = Number(row[5]); const cc = Number(row[6]);
      runWithDateGuard(d, ['cost_skill', m, cnt, 0, inp, outp, cr, cc, 0, estimateCost(m, inp, outp, cr, cc)]);
    }

    // ── kind='tool' : メッセージトークン/ターン時間按分のツール別日次集計 ──
    for (const row of this.aggregateToolUsageByDateRange(tzOffset)) {
      runWithDateGuard(row.date, ['tool', row.tool, row.count, row.tokens, 0, 0, 0, 0, row.durationMs, 0]);
    }

    // ── kind='skill' : スキル別日次集計（session start_time 基準）──
    const skillCounts = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS d, mtc.skill_name, COUNT(*) AS count
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.skill_name IS NOT NULL AND ${SESSION_DATE_FILTER}
       GROUP BY d, mtc.skill_name`,
    );
    for (const row of skillCounts[0]?.values ?? []) {
      runWithDateGuard(asText(row[0] ?? ''), ['skill', asText(row[1] ?? ''), Number(row[2] ?? 0), 0, 0, 0, 0, 0, 0, 0]);
    }

    // ── kind='error' : ツール別エラー日次集計（session start_time 基準）──
    const errors = db.exec(
      String.raw`SELECT DATE(s.start_time, '${tzOffset}') AS d,
              CASE
                WHEN mtc.tool_name LIKE 'mcp\_\_%\_\_%' ESCAPE '\'
                THEN SUBSTR(mtc.tool_name, 1, INSTR(SUBSTR(mtc.tool_name, 6), '__') + 4)
                ELSE mtc.tool_name
              END AS tool,
              SUM(mtc.is_error) AS err_count
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE ${SESSION_DATE_FILTER}
       GROUP BY d, tool
       HAVING err_count > 0`,
    );
    for (const row of errors[0]?.values ?? []) {
      runWithDateGuard(asText(row[0] ?? ''), ['error', asText(row[1] ?? ''), Number(row[2] ?? 0), 0, 0, 0, 0, 0, 0, 0]);
    }

    // ── kind='model' : assistant メッセージ数のモデル別日次集計（session start_time 基準）──
    const modelCounts = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS d,
              s.source,
              COALESCE(m.model, '') AS model,
              COUNT(*) AS count,
              CAST(SUM(COALESCE(m.input_tokens, 0) + COALESCE(m.output_tokens, 0)) AS INTEGER) AS tokens
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant' AND ${SESSION_DATE_FILTER}
       GROUP BY d, s.source, COALESCE(m.model, '')`,
    );
    for (const row of modelCounts[0]?.values ?? []) {
      const source = String(row[1]) as PricingSource;
      const model = resolvePricingModelName(asText(row[2] ?? ''), source);
      runWithDateGuard(asText(row[0] ?? ''), ['model', model, Number(row[3] ?? 0), Number(row[4] ?? 0), 0, 0, 0, 0, 0, 0]);
    }

    stmt.free();

    if (droppedDates > 0) {
      this.logger.warn(`rebuildDailyCounts: dropped ${droppedDates} rows with non-YYYY-MM-DD date (likely sessions without start_time)`);
    }
  }

  /** 当日（JST）の input + output トークン合計を返す。 */
  getDailyTokensToday(): number {
    const db = this.ensureDb();
    const tzOffset = getSqliteTzOffset('Asia/Tokyo');
    const result = db.exec(
      `SELECT s.source,
        SUM(COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)) AS raw_tokens,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
         AND DATE(m.timestamp, '${tzOffset}') = DATE('now', '${tzOffset}')
       GROUP BY s.source`,
    );
    let total = 0;
    for (const row of result[0]?.values ?? []) {
      const rawTokens = Number(row[1]);
      const totalTurns = Number(row[2]);
      const missingTurns = Number(row[3]);
      const observed = totalTurns - missingTurns;
      const factor = observed > 0 ? totalTurns / observed : 1;
      total += Math.round(rawTokens * factor);
    }
    return total;
  }

  /** 指定セッションの input + output トークン合計を返す（欠損補正済み）。 */
  getSessionTokens(sessionId: string): number {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT
        SUM(COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)) AS raw_tokens,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       WHERE m.type = 'assistant' AND m.session_id = ?`,
      [sessionId],
    );
    const row = result[0]?.values[0];
    if (!row) return 0;
    const rawTokens = Number(row[0] ?? 0);
    const totalTurns = Number(row[1] ?? 0);
    const missingTurns = Number(row[2] ?? 0);
    const observed = totalTurns - missingTurns;
    const factor = observed > 0 ? totalTurns / observed : 1;
    return Math.round(rawTokens * factor);
  }

  /**
   * 副作用: 整合性監視の記録と、in-memory ストレージへの書き出し。
   *
   * **file-backed のときは書き出しを行わない**。better-sqlite3 は実行時点で既にファイルへ
   * 永続化しており、`export()`（file-backed では `fs.readFileSync(dbPath)`）→
   * `storage.save()`（同じパスへ `writeFileSync`）は同内容を読んで書き戻すだけの往復だった。
   * これは sql.js（in-memory のため save で書き出す必要があった）時代の名残。
   *
   * 2026-07-17 の事故: trail.db が 2 GiB を 1.2MB 超えた時点で `readFileSync` が
   * `RangeError: File size ... is greater than 2 GiB` を投げ、`init()` → `createTables()` →
   * `save()` の経路で拡張が起動不能になった。サイズ依存の崖を作らないため往復自体を断つ。
   * in-memory 経路は読み出しでしか外へ出せないため従来どおり export → save する。
   */
  save(): void {
    const db = this.ensureDb();
    const alerts = this.integrityMonitor.recordAndDetect(db);
    if (alerts.length > 0 && this.onIntegrityAlert) {
      this.onIntegrityAlert(alerts);
    }
    if (this.storage.getFilePath() !== null) return;
    const data = db.export();
    this.storage.save(data);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  /**
   * better-sqlite3 の生ハンドルを返す（未オープンなら null）。
   *
   * `SpecDocIndex` / `FileChangeResolver` のように better-sqlite3 の API を直接使う
   * 読み取り専用コンポーネントへ渡すための出口。書き込みには使わないこと
   * （書き込みは TrailDatabase のメソッド経由で行い、integrity monitor と save を通す）。
   */
  getRawSqliteHandle(): BetterSqlite3Database | null {
    return this.db?.raw ?? null;
  }

  // -------------------------------------------------------------------------
  //  Import
  // -------------------------------------------------------------------------

  /** Load all imported sessions into memory for fast lookup during importAll. */
  /** Load imported sessions keyed by file_path for accurate skip detection.
   *  `hasMessages` is false when `sessions` row exists but no `messages` rows are present
   *  (happens after a silent message-insert failure). Callers should re-import such sessions. */
  /**
   * 既存 import 済セッションの (file_path → 状態) マップ。
   *
   * - LEP `SessionImporter` (Step 2b) が file-size skip 判定で使用する。
   * - LEP 移行前は `importAll()` 内の Phase 1 が同じく内部利用していた。
   */
  getImportedFileMap(): Map<string, { sessionId: string; fileSize: number; commitsResolved: boolean; hasMessages: boolean; hasUsableCostData: boolean }> {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT s.id, s.file_path, s.file_size, s.commits_resolved_at,
        CASE WHEN s.message_count = 0 THEN 1
             WHEN EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id) THEN 1
             ELSE 0 END AS has_messages,
        CASE WHEN s.source = 'codex' AND s.message_count > 0 THEN
             CASE WHEN EXISTS (
               SELECT 1 FROM session_costs sc
               WHERE sc.session_id = s.id
                 AND (COALESCE(sc.input_tokens, 0) + COALESCE(sc.output_tokens, 0) +
                      COALESCE(sc.cache_read_tokens, 0) + COALESCE(sc.cache_creation_tokens, 0) +
                      COALESCE(sc.estimated_cost_usd, 0)) > 0
             ) THEN 1 ELSE 0 END
             ELSE 1 END AS has_usable_cost_data
       FROM sessions s`,
    );
    const map = new Map<string, { sessionId: string; fileSize: number; commitsResolved: boolean; hasMessages: boolean; hasUsableCostData: boolean }>();
    for (const row of result[0]?.values ?? []) {
      map.set(String(row[1]), {
        sessionId: String(row[0]),
        fileSize: Number(row[2]),
        commitsResolved: row[3] != null,
        hasMessages: Number(row[4]) === 1,
        hasUsableCostData: Number(row[5]) === 1,
      });
    }
    return map;
  }

  /** Get set of session IDs that exist in DB. */

  isImported(sessionId: string): boolean {
    const db = this.ensureDb();
    const stmt = db.prepare('SELECT 1 FROM sessions WHERE id = ? LIMIT 1');
    stmt.bind([sessionId]);
    const exists = stmt.step();
    stmt.free();
    return exists;
  }

  getImportedFileSize(sessionId: string): number {
    const db = this.ensureDb();
    const stmt = db.prepare('SELECT file_size FROM sessions WHERE id = ? LIMIT 1');
    stmt.bind([sessionId]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as { file_size: number };
      stmt.free();
      return row.file_size;
    }
    stmt.free();
    return 0;
  }

  isCommitsResolved(sessionId: string): boolean {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT 1 FROM sessions WHERE id = ? AND commits_resolved_at IS NOT NULL LIMIT 1',
    );
    stmt.bind([sessionId]);
    const exists = stmt.step();
    stmt.free();
    return exists;
  }

  private getSessionTimeRange(sessionId: string): {
    startTime: string; endTime: string; gitBranch: string;
  } | null {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT start_time, end_time FROM sessions WHERE id = ? LIMIT 1',
    );
    stmt.bind([sessionId]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as {
      start_time: string; end_time: string;
    };
    stmt.free();

    // git_branch is stored in messages table, not sessions
    let gitBranch = '';
    try {
      const branchResult = db.exec(
        `SELECT git_branch FROM messages
         WHERE session_id = ? AND git_branch IS NOT NULL AND git_branch != ''
         LIMIT 1`,
        [sessionId],
      );
      gitBranch = asText(branchResult[0]?.values[0]?.[0] ?? '');
    } catch { /* no branch info available */ }

    return {
      startTime: row.start_time,
      endTime: row.end_time,
      gitBranch,
    };
  }

  /** Session-Id トレーラーから UUID を抽出。なければ null */
  parseSessionIdFromBody(body: string): string | null {
    const match = /^Session-Id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/im.exec(body);
    return match ? match[1] : null;
  }

  private readCodexSessionMeta(filePath: string): { cwd: string | null } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let rec: RawLine;
        try {
          rec = JSON.parse(trimmed) as RawLine;
        } catch {
          continue;
        }
        if (rec.type !== 'session_meta' || !rec.payload || typeof rec.payload !== 'object') continue;
        const cwd = rec.payload?.cwd;
        return { cwd: typeof cwd === 'string' ? cwd : null };
      }
      return null;
    } catch {
      return null;
    }
  }

  resolveCommits(sessionId: string, gitRoot: string, repoName: string): number {
    const db = this.ensureDb();
    const range = this.getSessionTimeRange(sessionId);
    if (!range) return 0;

    const { startTime, endTime, gitBranch } = range;

    // Add 5 minutes buffer to endTime for commits made right after session
    const endDate = new Date(endTime);
    endDate.setMinutes(endDate.getMinutes() + 5);
    const bufferedEnd = endDate.toISOString();

    const execOpts = { encoding: 'utf-8' as const, timeout: 10_000 };
    const logFormat = '%H%x00%s%x00%an%x00%aI%x00%b%x1e';

    // Phase D: 外部 API は repo_name を受けるが、内部で repo_id を解決して保存する (PK 構成列)。
    // Phase H-4: repo_name 列は撤去済。repo 帰属は repo_id のみで保存する。
    const repoId = this.repoIdForName(repoName);

    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO session_commits
        (session_id, commit_hash, commit_message, author, committed_at,
         is_ai_assisted, files_changed, lines_added, lines_deleted, repo_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );

    let count = 0;

    // Phase A: Session-Id trailer exact match
    try {
      const grepPattern = `^Session-Id: ${sessionId}$`;
      const phaseAOutput = execFileSync('git', [
        'log', '--all',
        '--extended-regexp', `--grep=${grepPattern}`,
        `--format=${logFormat}`,
        '--no-merges',
      ], { ...execOpts, cwd: gitRoot });

      count += this.processCommitEntries(phaseAOutput, sessionId, repoId, insertStmt, execOpts, gitRoot);
    } catch {
      // git grep may fail if no commits match — not an error
    }

    // Phase B: Time-range fallback (existing behavior + Session-Id filter)
    let logOutput = '';
    const useBranch = gitBranch && gitBranch.trim() !== '';
    try {
      logOutput = execFileSync('git', [
        'log', useBranch ? gitBranch : '--all',
        `--after=${startTime}`,
        `--before=${bufferedEnd}`,
        `--format=${logFormat}`,
        '--no-merges',
      ], { ...execOpts, cwd: gitRoot });
    } catch {
      try {
        logOutput = execFileSync('git', [
          'log', '--all',
          `--after=${startTime}`,
          `--before=${bufferedEnd}`,
          `--format=${logFormat}`,
          '--no-merges',
        ], { ...execOpts, cwd: gitRoot });
      } catch {
        // On any git error, mark as resolved and return Phase A count
        insertStmt.free();
        this.markCommitResolutionDone(sessionId, repoName);
        return count;
      }
    }

    count += this.processCommitEntries(logOutput, sessionId, repoId, insertStmt, execOpts, gitRoot, true);

    insertStmt.free();

    this.markCommitResolutionDone(sessionId, repoName);

    return count;
  }

  /** Mark (sessionId, repoName) as resolved in session_commit_resolutions, plus legacy sessions.commits_resolved_at. */
  private markCommitResolutionDone(sessionId: string, repoName: string): void {
    const db = this.ensureDb();
    // Phase D: PK が (session_id, repo_id) になったため repo_id を解決して ON CONFLICT を repo_id 基準にする。
    // Phase H-4: repo_name 列は撤去済。repo 帰属は repo_id のみで保存する。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `INSERT INTO session_commit_resolutions (session_id, repo_id, resolved_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(session_id, repo_id) DO UPDATE SET resolved_at = excluded.resolved_at`,
      [sessionId, repoId],
    );
    // 既存挙動の互換: 主リポジトリ解決時も sessions.commits_resolved_at を更新
    db.run(
      "UPDATE sessions SET commits_resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      [sessionId],
    );
  }

  /** Returns true if (sessionId, repoName) is already recorded as resolved. */
  isCommitResolutionDone(sessionId: string, repoName: string): boolean {
    const db = this.ensureDb();
    // Phase H-4: repo_name 列は撤去済。repo フィルタは repo_id = ? (repoIdForName 解決) で行う。
    const r = db.exec(
      'SELECT 1 FROM session_commit_resolutions WHERE session_id = ? AND repo_id = ? LIMIT 1',
      [sessionId, this.repoIdForNameReadonly(repoName)],
    );
    return Boolean(r[0]?.values?.length);
  }

  /** Parse git numstat output into file stats. */
  private parseNumstat(
    hash: string,
    execOpts: { encoding: 'utf-8'; timeout: number },
    gitRoot: string,
  ): { filesChanged: number; linesAdded: number; linesDeleted: number; filePaths: string[] } {
    let filesChanged = 0;
    let linesAdded = 0;
    let linesDeleted = 0;
    const filePaths: string[] = [];
    try {
      const numstat = execFileSync('git', [
        'diff', '--numstat', `${hash}^..${hash}`,
      ], { ...execOpts, cwd: gitRoot });
      for (const line of numstat.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('\t');
        filesChanged++;
        if (parts[0] !== '-') linesAdded += Number.parseInt(parts[0], 10) || 0;
        if (parts[1] !== '-') linesDeleted += Number.parseInt(parts[1], 10) || 0;
        if (parts[2]) filePaths.push(parts[2]);
      }
    } catch {
      // Initial commit or other error — skip numstat
    }
    return { filesChanged, linesAdded, linesDeleted, filePaths };
  }

  /** Insert commit_files rows for a single commit hash. */
  // Phase H-4: commit_files.repo_name 列は撤去済。repo 帰属は repo_id のみで保存する。
  private insertCommitFiles(hash: string, filePaths: string[], repoId: number): void {
    if (filePaths.length === 0) return;
    const filesStmt = this.ensureDb().prepare(
      'INSERT OR IGNORE INTO commit_files (commit_hash, file_path, repo_id) VALUES (?, ?, ?)',
    );
    try {
      for (const fp of filePaths) {
        filesStmt.run([hash, fp, repoId]);
      }
    } finally {
      filesStmt.free();
    }
  }

  /** Parse git log output and insert commits into session_commits table.
   *  @param filterBySessionId If true, skip commits whose Session-Id trailer belongs to another session */
  // Phase H-4: session_commits / commit_files.repo_name 列は撤去済。repo 帰属は repoId のみで扱う。
  private processCommitEntries(
    logOutput: string,
    sessionId: string,
    repoId: number,
    insertStmt: SqlJsStatement,
    execOpts: { encoding: 'utf-8'; timeout: number },
    gitRoot: string,
    filterBySessionId = false,
  ): number {
    const commits = logOutput
      .split('\x1e')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let count = 0;
    for (const entry of commits) {
      const parts = entry.split('\x00');
      if (parts.length < 4) continue;

      const hash = parts[0];
      const subject = parts[1];
      const author = parts[2];
      const committedAt = toUTC(parts[3]);
      const body = parts[4] ?? '';

      // Phase B filter: skip commits that belong to a different session
      if (filterBySessionId) {
        const trailerSessionId = this.parseSessionIdFromBody(body);
        if (trailerSessionId && trailerSessionId !== sessionId) continue;
      }

      const isAiAssisted = /Co-Authored-By:.*Claude/i.test(body) ? 1 : 0;
      const { filesChanged, linesAdded, linesDeleted, filePaths } =
        this.parseNumstat(hash, execOpts, gitRoot);

      insertStmt.run([
        sessionId, hash, subject, author, committedAt,
        isAiAssisted, filesChanged, linesAdded, linesDeleted, repoId,
      ]);

      this.insertCommitFiles(hash, filePaths, repoId);
      count++;
    }

    return count;
  }

  /**
   * 外部トランザクション制御用。`importSession(..., externalTransaction=true)` を呼ぶ caller が
   * 自前で BEGIN / COMMIT / ROLLBACK を発行できるよう、SQL 実行口を提供する。
   *
   * LEP `SessionImporter` (Step 2b) が batch transaction 管理 (BATCH_MESSAGE_LIMIT=20_000 /
   * BATCH_FILE_LIMIT=100) のために利用する。
   */
  beginExternalTransaction(): void {
    this.ensureDb().run('BEGIN TRANSACTION');
  }

  /** @see beginExternalTransaction */
  commitExternalTransaction(): void {
    this.ensureDb().run('COMMIT');
  }

  /** @see beginExternalTransaction */
  rollbackExternalTransaction(): void {
    this.ensureDb().run('ROLLBACK');
  }

  private buildMessageInsertParams(
    raw: RawLine,
    sessionId: string,
    isSubagent: boolean,
    fileSubagentType: string | null,
  ): unknown[] {
    const textContent = raw.type === 'assistant'
      ? extractTextContent(raw.message?.content) : null;
    const userMessageContent = typeof raw.message?.content === 'string' ? raw.message.content : null;
    const userContent = raw.type === 'user' ? userMessageContent : null;
    const toolCalls = raw.type === 'assistant' ? extractToolCalls(raw.message?.content) : null;

    // tool_use_result: ユーザーメッセージの content から tool_result ブロックを抽出する。
    let toolUseResult: string | null = null;
    if (raw.type === 'user' && Array.isArray(raw.message?.content)) {
      const toolResults = (raw.message.content as unknown[]).filter(
        (b) => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'tool_result',
      );
      if (toolResults.length > 0) toolUseResult = JSON.stringify(toolResults);
    }
    if (!toolUseResult && raw.toolUseResult != null) {
      toolUseResult = typeof raw.toolUseResult === 'string'
        ? raw.toolUseResult : JSON.stringify(raw.toolUseResult);
    }

    const durationMs = raw.durationMs ?? null;
    const toolResultSize = estimateTokenCount(toolUseResult);
    const agentInfo = extractAgentInfo(toolCalls);
    const permMode = raw.permissionMode ?? null;
    const skill = extractSkillName(toolCalls);
    const agentId = raw.agentId ?? null;
    const sourceToolAssistantUUID = raw.sourceToolAssistantUUID ?? null;
    const sourceToolUseID = raw.sourceToolUseID ?? null;
    const systemCommandInner = raw.subtype === 'local_command' ? '/clear' : null;
    const systemCommand = raw.subtype === 'compact_boundary' ? '/compact' : systemCommandInner;
    // 主セッションでは Agent tool_use を持つ親メッセージのみ subagent_type を持つ（呼び出し意図記録）。
    // サブエージェント JSONL では全メッセージが meta.json 由来の subagent_type を持つ。
    const subagentType = isSubagent ? fileSubagentType : agentInfo.subagentType;

    return [
      raw.uuid ?? '', sessionId, raw.parentUuid ?? null,
      raw.type ?? '', raw.subtype ?? null,
      textContent, userContent, toolCalls, toolUseResult,
      raw.message?.model ?? null, raw.requestId ?? null, raw.message?.stop_reason ?? null,
      raw.message?.usage?.input_tokens ?? 0, raw.message?.usage?.output_tokens ?? 0,
      raw.message?.usage?.cache_read_input_tokens ?? 0, raw.message?.usage?.cache_creation_input_tokens ?? 0,
      raw.message?.usage?.service_tier ?? null, raw.message?.usage?.speed ?? null,
      toUTC(raw.timestamp ?? ''), raw.isSidechain ? 1 : 0, raw.isMeta ? 1 : 0,
      raw.cwd ?? null, raw.gitBranch ?? null,
      durationMs, toolResultSize, agentInfo.description, agentInfo.model,
      permMode, skill, agentId, sourceToolAssistantUUID, sourceToolUseID,
      systemCommand, subagentType,
    ];
  }

  /** @returns number of messages imported */
  importSession(filePath: string, repoName: string, isSubagent = false, externalTransaction = false): number {
    const db = this.ensureDb();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim() !== '');

    // サブエージェント JSONL の場合は隣接 meta.json から subagent_type を取得し、
    // この JSONL 内の全メッセージに付与する。古いセッションは meta.json なし → NULL のまま。
    const fileSubagentType = isSubagent ? readSubagentTypeFromMeta(filePath) : null;

    const parsedRaw: RawLine[] = [];
    for (const line of lines) {
      try {
        parsedRaw.push(JSON.parse(line) as RawLine);
      } catch {
        // Skip malformed lines
      }
    }

    if (parsedRaw.length === 0) return 0;

    const fallbackSessionId = path.basename(filePath).replace(/\.jsonl$/i, '');
    const isCodex = parsedRaw.some(
      (r) => r.type === 'session_meta' || r.type === 'response_item' || r.type === 'event_msg',
    );
    const codexNormalized = isCodex ? normalizeCodexRecords(parsedRaw, fallbackSessionId) : null;
    const parsed: RawLine[] = codexNormalized ? codexNormalized.normalized : parsedRaw;
    const source: 'claude_code' | 'codex' = isCodex ? 'codex' : 'claude_code';
    if (parsed.length === 0) return 0;

    // Extract session metadata
    let sessionId = '';
    let slug = '';
    let version = '';
    let model = '';
    let entrypoint = '';
    let startTime = '';
    let endTime = '';
    let messageCount = 0;

    // Collect messages to insert
    const messagesToInsert: RawLine[] = [];

    for (const raw of parsed) {
      if (!raw.type || SKIP_TYPES.has(raw.type)) continue;
      if (raw.isMeta === true) continue;

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId;
      if (!slug && raw.slug) slug = raw.slug;
      if (!version && raw.version) version = raw.version;
      if (!entrypoint && raw.entrypoint) entrypoint = raw.entrypoint;
      if (!model && raw.message?.model) model = raw.message.model;
      if (!startTime && raw.timestamp) startTime = toUTC(raw.timestamp);
      if (raw.timestamp) endTime = toUTC(raw.timestamp);

      messagesToInsert.push(raw);
      messageCount++;
    }

    if (!sessionId) sessionId = codexNormalized?.sessionId || fallbackSessionId;
    if (!version && codexNormalized?.version) version = codexNormalized.version;

    const fileSize = fs.statSync(filePath).size;
    const importedAt = new Date().toISOString();

    if (!externalTransaction) db.run('BEGIN TRANSACTION');
    try {
      // Insert/update session metadata only for main session files
      if (!isSubagent) {
        // start_time / end_time が空のままだと daily_counts 集計で
        // DATE('') が NULL を返し JS String(null) === 'null' で CHECK 違反になる。
        // 空はそもそも意味のあるタイムスタンプではないため NULL に正規化する。
        const startTimeOrNull: string | null = startTime || null;
        const endTimeOrNull: string | null = endTime || null;
        if (!startTime) {
          this.logger.warn(`importSession: ${filePath} has no parseable timestamp; storing start_time as NULL`);
        }
        // Phase D: 外部 API は repo_name を受けるが、内部で repoIdForName により repo_id を解決して保存する。
        // Phase H-4: repo_name 列は撤去済。repo 帰属は repo_id のみで保存する。
        const repoId = this.repoIdForName(repoName);
        db.run(INSERT_SESSION, [
          sessionId, slug, repoId, version,
          entrypoint, model, startTimeOrNull, endTimeOrNull, messageCount,
          filePath, fileSize, importedAt, source,
        ]);
      }

      // Insert messages
      const msgStmt = db.prepare(INSERT_MESSAGE);
      for (const raw of messagesToInsert) {
        const params = this.buildMessageInsertParams(raw, sessionId, isSubagent, fileSubagentType);
        msgStmt.run(params);
      }
      msgStmt.free();

      if (!externalTransaction) db.run('COMMIT');
      return messageCount;
    } catch (err) {
      if (!externalTransaction) db.run('ROLLBACK');
      throw err;
    }
  }

  private collectClaudeCodeSessionDirs(
    projectDirs: string[],
    projectsDir: string,
    UUID_RE: RegExp,
  ): Array<{ sid: string; mainFile: string; subagentFiles: string[]; repoName: string; source: 'claude_code' | 'codex' }> {
    const sessionDirs: Array<{ sid: string; mainFile: string; subagentFiles: string[]; repoName: string; source: 'claude_code' | 'codex' }> = [];
    for (const projectName of projectDirs) {
      const projectPath = path.join(projectsDir, projectName);
      try {
        if (!fs.statSync(projectPath).isDirectory()) continue;
      } catch { continue; }

      let entries: string[];
      try { entries = fs.readdirSync(projectPath); } catch { continue; }

      for (const entry of entries) {
        if (!entry.endsWith('.jsonl')) continue;
        const sid = entry.slice(0, -6);
        if (!UUID_RE.test(sid)) continue;
        const mainFile = path.join(projectPath, entry);
        const subagentDir = path.join(projectPath, sid, 'subagents');
        const subagentFiles: string[] = [];
        try {
          for (const sf of fs.readdirSync(subagentDir)) {
            if (sf.endsWith('.jsonl')) subagentFiles.push(path.join(subagentDir, sf));
          }
        } catch { /* no subagents dir */ }
        const derivedRepoName = extractRepoNameFromJsonl(mainFile) ?? projectName.replace(/^-+/, '');
        sessionDirs.push({ sid, mainFile, subagentFiles, repoName: derivedRepoName, source: 'claude_code' });
      }
    }
    return sessionDirs;
  }

  private collectCodexSessionDirs(
    codexSessionsDir: string,
    gitRoot: string | undefined,
    repoName: string,
  ): Array<{ sid: string; mainFile: string; subagentFiles: string[]; repoName: string; source: 'claude_code' | 'codex' }> {
    const sessionDirs: Array<{ sid: string; mainFile: string; subagentFiles: string[]; repoName: string; source: 'claude_code' | 'codex' }> = [];
    try {
      const codexFiles = collectJsonlFilesRecursive(codexSessionsDir).filter((f: string) =>
        path.basename(f).startsWith('rollout-'),
      );
      for (const filePath of codexFiles) {
        const sidMatch = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(filePath);
        const sid = sidMatch?.[1] ?? path.basename(filePath, '.jsonl');
        if (gitRoot) {
          const meta = this.readCodexSessionMeta(filePath);
          if (!meta?.cwd) continue;
          if (!path.resolve(meta.cwd).startsWith(path.resolve(gitRoot))) continue;
        }
        sessionDirs.push({ sid, mainFile: filePath, subagentFiles: [], repoName: repoName || 'codex', source: 'codex' });
      }
    } catch {
      // codex sessions may not exist
    }
    return sessionDirs;
  }

  private async importAllPhaseResolveReleases(
    onProgress: ((msg: string, inc?: number) => void) | undefined,
    onPhase: ((e: ImportAllPhaseEvent) => void) | undefined,
    yieldForUi: () => Promise<void>,
    phasesToSkip: ReadonlySet<ImportAllPhase>,
    gitRoot: string | undefined,
    initialCount: number,
  ): Promise<number> {
    let releasesResolved = initialCount;
    const skip = phasesToSkip.has('resolve_releases');
    if (!skip && gitRoot) {
      onPhase?.({ phase: 'resolve_releases', action: 'start' });
      await yieldForUi();
      let failed = false;
      try {
        onProgress?.('Resolving releases from version tags...', 0);
        releasesResolved = this.resolveReleases(gitRoot);
        onProgress?.(`Releases resolved: ${releasesResolved}`, 0);
      } catch (e) {
        failed = true;
        onPhase?.({ phase: 'resolve_releases', action: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      try {
        onProgress?.('Resolving release times...', 0);
        const timesResolved = this.resolveReleaseTimes();
        onProgress?.(`Release times resolved: ${timesResolved}`, 0);
      } catch (e) {
        if (!failed) {
          onPhase?.({ phase: 'resolve_releases', action: 'error', message: e instanceof Error ? e.message : String(e) });
          failed = true;
        }
      }
      if (!failed) onPhase?.({ phase: 'resolve_releases', action: 'finish', count: releasesResolved });
    } else if (!skip) {
      onPhase?.({ phase: 'resolve_releases', action: 'skip', message: 'no gitRoot' });
    }
    await yieldForUi();
    return releasesResolved;
  }

  private async importAllPhaseAnalyzeReleases(
    onProgress: ((msg: string, inc?: number) => void) | undefined,
    onPhase: ((e: ImportAllPhaseEvent) => void) | undefined,
    yieldForUi: () => Promise<void>,
    phasesToSkip: ReadonlySet<ImportAllPhase>,
    gitRoot: string | undefined,
    analyzeFn: AnalyzeFunction | undefined,
    excludePatterns: readonly string[] | undefined,
  ): Promise<number> {
    let releasesAnalyzed = 0;
    const skip = phasesToSkip.has('analyze_releases');
    if (skip) {
      // CodeGraphBuilder が担当
    } else if (gitRoot && analyzeFn) {
      onPhase?.({ phase: 'analyze_releases', action: 'start' });
      await yieldForUi();
      try {
        onProgress?.('Analyzing releases...', 0);
        releasesAnalyzed = await this.analyzeReleases(gitRoot, analyzeFn, (msg) => onProgress?.(msg, 0), excludePatterns);
        onProgress?.(`Releases analyzed: ${releasesAnalyzed}`, 0);
        onPhase?.({ phase: 'analyze_releases', action: 'finish', count: releasesAnalyzed });
      } catch (e) {
        onPhase?.({ phase: 'analyze_releases', action: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    } else {
      onPhase?.({ phase: 'analyze_releases', action: 'skip', message: gitRoot ? 'no analyzeFn' : 'no gitRoot' });
    }
    await yieldForUi();
    return releasesAnalyzed;
  }

  private async importAllPhaseImportCoverage(
    onProgress: ((msg: string, inc?: number) => void) | undefined,
    onPhase: ((e: ImportAllPhaseEvent) => void) | undefined,
    yieldForUi: () => Promise<void>,
    phasesToSkip: ReadonlySet<ImportAllPhase>,
    gitRoot: string | undefined,
    initialCoverage: number,
    initialCurrentCoverage: number,
  ): Promise<{ coverageImported: number; currentCoverageImported: number }> {
    let coverageImported = initialCoverage;
    let currentCoverageImported = initialCurrentCoverage;
    const skip = phasesToSkip.has('import_coverage');
    if (!skip && gitRoot) {
      onPhase?.({ phase: 'import_coverage', action: 'start' });
      await yieldForUi();
      let failed = false;
      try {
        onProgress?.('Importing coverage data...', 0);
        coverageImported = this.importCoverage(gitRoot);
        onProgress?.(`Coverage imported: ${coverageImported} entries`, 0);
      } catch (e) {
        failed = true;
        onPhase?.({ phase: 'import_coverage', action: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      try {
        onProgress?.('Importing current coverage snapshot...', 0);
        currentCoverageImported = this.importCurrentCoverage(gitRoot, path.basename(gitRoot));
        onProgress?.(`Current coverage imported: ${currentCoverageImported} entries`, 0);
      } catch (e) {
        if (!failed) {
          onPhase?.({ phase: 'import_coverage', action: 'error', message: e instanceof Error ? e.message : String(e) });
          failed = true;
        }
      }
      if (!failed) onPhase?.({ phase: 'import_coverage', action: 'finish', count: coverageImported + currentCoverageImported });
    } else if (!skip) {
      onPhase?.({ phase: 'import_coverage', action: 'skip', message: 'no gitRoot' });
    }
    await yieldForUi();
    return { coverageImported, currentCoverageImported };
  }

  private async importAllPhaseAnalyzeBehavior(
    onProgress: ((msg: string, inc?: number) => void) | undefined,
    onPhase: ((e: ImportAllPhaseEvent) => void) | undefined,
    yieldForUi: () => Promise<void>,
    phasesToSkip: ReadonlySet<ImportAllPhase>,
    effectiveSessionsToAnalyze: ReadonlySet<string>,
  ): Promise<void> {
    if (phasesToSkip.has('analyze_behavior')) {
      // skip entirely
    } else if (effectiveSessionsToAnalyze.size > 0) {
      onPhase?.({ phase: 'analyze_behavior', action: 'start', count: effectiveSessionsToAnalyze.size });
      await yieldForUi();
      const db = this.ensureDb();
      const analyzer = new ClaudeCodeBehaviorAnalyzer();
      onProgress?.(`Analyzing Claude Code behavior (${effectiveSessionsToAnalyze.size} sessions)...`, 0);
      let failedCount = 0;
      for (const sid of effectiveSessionsToAnalyze) {
        try {
          analyzer.analyze(sid, db);
        } catch (e) {
          failedCount += 1;
          this.logger.error(`ClaudeCodeBehaviorAnalyzer failed for session ${sid}`, e);
        }
      }
      onPhase?.({ phase: 'analyze_behavior', action: 'finish', count: effectiveSessionsToAnalyze.size - failedCount });
    } else {
      onPhase?.({ phase: 'analyze_behavior', action: 'skip', message: 'no new sessions' });
    }
    await yieldForUi();
  }

  private async importAllPhaseBackfill(
    onProgress: ((msg: string, inc?: number) => void) | undefined,
    onPhase: ((e: ImportAllPhaseEvent) => void) | undefined,
    yieldForUi: () => Promise<void>,
    phasesToSkip: ReadonlySet<ImportAllPhase>,
    gitRoot: string | undefined,
  ): Promise<number> {
    let messageCommitsBackfilled = 0;
    if (!phasesToSkip.has('backfill')) {
      onPhase?.({ phase: 'backfill', action: 'start' });
      await yieldForUi();
      let backfillFailed = false;
      if (gitRoot) {
        try {
          this.backfillCommitFiles(gitRoot, (msg) => onProgress?.(msg, 0));
        } catch (e) {
          backfillFailed = true;
          onPhase?.({ phase: 'backfill', action: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      }
      onProgress?.('Backfilling subagent_type...', 0);
      try {
        this.backfillSubagentType();
      } catch (e) {
        this.logger.warn(`backfillSubagentType failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
      }
      onProgress?.('Backfilling message_commits...', 0);
      messageCommitsBackfilled = this.backfillMessageCommits((msg) => onProgress?.(msg, 0));
      if (!backfillFailed) {
        onPhase?.({ phase: 'backfill', action: 'finish', count: messageCommitsBackfilled });
      }
    }
    return messageCommitsBackfilled;
  }

  async importAll(
    onProgress?: (message: string, increment?: number) => void,
    gitRoots?: readonly string[],
    excludePatterns?: readonly string[],
    analyzeFn?: AnalyzeFunction,
    onPhase?: (event: ImportAllPhaseEvent) => void,
    lepOpts?: ImportAllLepOptions,
  ): Promise<{ imported: number; skipped: number; commitsResolved: number; releasesResolved: number; releasesAnalyzed: number; coverageImported: number; currentCoverageImported: number; messageCommitsBackfilled: number }> {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions');
    // 主リポジトリは gitRoots[0] とみなす（コード解析・Codex セッションのフィルタに使う既存挙動の互換）
    const gitRoot = gitRoots?.[0];
    const repoName = gitRoot ? path.basename(gitRoot) : '';
    const watched = (gitRoots ?? []).map((r) => ({ gitRoot: r, repoName: path.basename(r) }));
    const phasesToSkip = lepOpts?.phasesToSkip ?? new Set<ImportAllPhase>();
    let imported = lepOpts?.externalCounters?.imported ?? 0;
    let skipped = lepOpts?.externalCounters?.skipped ?? 0;
    let commitsResolved = lepOpts?.externalCounters?.commitsResolved ?? 0;

    // phasesToSkip に import_sessions が含まれる場合、projects dir のスキャン自体を丸ごとスキップする。
    const skipImportSessions = phasesToSkip.has('import_sessions');

    let projectDirs: string[];
    if (skipImportSessions) {
      projectDirs = [];
    } else {
      try {
        projectDirs = fs.readdirSync(projectsDir);
      } catch {
        return { imported, skipped, commitsResolved, releasesResolved: 0, releasesAnalyzed: 0, coverageImported: 0, currentCoverageImported: 0, messageCommitsBackfilled: 0 };
      }
    }

    // Pre-load imported file paths + sizes for fast skip
    const importedFiles = this.getImportedFileMap();
    const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

    // Collect files per session directory (main + subagents grouped)
    const sessionDirs = [
      ...this.collectClaudeCodeSessionDirs(projectDirs, projectsDir, UUID_RE),
      ...(skipImportSessions ? [] : this.collectCodexSessionDirs(codexSessionsDir, gitRoot, repoName)),
    ];

    const totalSessions = sessionDirs.length;
    const totalFiles = sessionDirs.reduce((s, d) => s + 1 + d.subagentFiles.length, 0);
    const claudeSessions = sessionDirs.filter(d => d.source === 'claude_code');
    const codexSessions = sessionDirs.filter(d => d.source === 'codex');
    const claudeFiles = claudeSessions.reduce((s, d) => s + 1 + d.subagentFiles.length, 0);
    const codexFiles = codexSessions.reduce((s, d) => s + 1 + d.subagentFiles.length, 0);

    const BATCH_MESSAGE_LIMIT = 20_000;
    const BATCH_FILE_LIMIT = 100;
    let batchMessageCount = 0;
    let batchFileCount = 0;
    let inTransaction = false;
    let processedFiles = 0;
    const processedBySource = { claude_code: 0, codex: 0 };
    const skippedBySource = { claude_code: 0, codex: 0 };
    // Sessions that entered the import path in this run. Sessions skipped via
    // the file-size check did not gain new messages, so message_tool_calls is
    // already up to date and the analyzer can be skipped for them.
    const sessionsToAnalyze = new Set<string>();

    const formatProgress = (): string =>
      `${batchMessageCount} messages (${processedFiles}/${totalFiles}, skipped ${skipped}): ` +
      `Claude Code ${processedBySource.claude_code}/${claudeFiles} skipped ${skippedBySource.claude_code}, ` +
      `Codex ${processedBySource.codex}/${codexFiles} skipped ${skippedBySource.codex}`;

    // UI (OllamaProvider tree) が phase 遷移を per-phase でレンダリングできるよう、
    // onPhase emit 直後に event loop へ yield する。短い phase が同期連続すると
    // _onDidChangeTreeData.fire() の処理が後回しになり中間状態が見えなくなるため。
    const yieldForUi = async (): Promise<void> => {
      if (onPhase) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };

    if (!skipImportSessions) {
      onProgress?.(
        `Found ${totalSessions} sessions (${totalFiles} files): ` +
          `Claude Code ${claudeSessions.length} sessions (${claudeFiles} files), ` +
          `Codex ${codexSessions.length} sessions (${codexFiles} files)`,
        0,
      );
      onPhase?.({ phase: 'import_sessions', action: 'start', count: totalSessions });
      await yieldForUi();
    }

    for (const dir of sessionDirs) {
      const sessionFileTotal = 1 + dir.subagentFiles.length;
      // Skip entire session (main + all subagents) if main file size unchanged
      // and the existing row actually has messages. A session row with zero messages
      // is a leftover from a previously-failed import and must be re-processed.
      const existing = importedFiles.get(dir.mainFile);
      if (existing && existing.hasMessages && existing.hasUsableCostData) {
        let currentFileSize = 0;
        try { currentFileSize = fs.statSync(dir.mainFile).size; } catch (e) { this.logger.error(`statSync failed: ${dir.mainFile}`, e); skipped++; skippedBySource[dir.source]++; continue; }
        if (currentFileSize <= existing.fileSize) {
          skipped += sessionFileTotal;
          skippedBySource[dir.source] += sessionFileTotal;
          processedFiles += sessionFileTotal;
          processedBySource[dir.source] += sessionFileTotal;
          for (const w of watched) {
            if (this.isCommitResolutionDone(dir.sid, w.repoName)) continue;
            try { commitsResolved += this.resolveCommits(dir.sid, w.gitRoot, w.repoName); } catch (e) { this.logger.error(`resolveCommits failed (skipped session): ${dir.sid} repo=${w.repoName}`, e); }
          }
          continue;
        }
      }

      sessionsToAnalyze.add(dir.sid);

      // Import all files for this session (main + subagents) in one batch
      const db = this.ensureDb();
      if (!inTransaction) {
        db.run('BEGIN TRANSACTION');
        inTransaction = true;
        batchMessageCount = 0;
        batchFileCount = 0;
      }

      const filesToImport = [
        { filePath: dir.mainFile, isSubagent: false },
        ...dir.subagentFiles.map((f) => ({ filePath: f, isSubagent: true })),
      ];

      for (const file of filesToImport) {
        try {
          const msgCount = this.importSession(file.filePath, dir.repoName, file.isSubagent, true);
          imported++;
          batchMessageCount += msgCount;
          batchFileCount++;
        } catch (e) {
          this.logger.error(`importSession failed: ${file.filePath}`, e);
        }
        processedFiles++;
        processedBySource[dir.source]++;
      }

      // Resolve commits after all files for this session — once per watched repo
      for (const w of watched) {
        if (this.isCommitResolutionDone(dir.sid, w.repoName)) continue;
        try { commitsResolved += this.resolveCommits(dir.sid, w.gitRoot, w.repoName); } catch (e) { this.logger.error(`resolveCommits failed: ${dir.sid} repo=${w.repoName}`, e); }
      }

      // Commit at session boundary when limits exceeded
      if (batchMessageCount >= BATCH_MESSAGE_LIMIT || batchFileCount >= BATCH_FILE_LIMIT) {
        if (inTransaction) {
          try { db.run('COMMIT'); } catch (e) { this.logger.error('COMMIT failed, rolling back', e); try { db.run('ROLLBACK'); } catch (error_) { this.logger.error('ROLLBACK also failed', error_); } }
          inTransaction = false;
        }
        onProgress?.(formatProgress(), 0);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    // Commit remaining batch
    if (inTransaction) {
      const db = this.ensureDb();
      try { db.run('COMMIT'); } catch (e) { this.logger.error('COMMIT failed, rolling back', e); try { db.run('ROLLBACK'); } catch (error_) { this.logger.error('ROLLBACK also failed', error_); } }
      onProgress?.(formatProgress(), 0);
    }
    if (!skipImportSessions) {
      onPhase?.({ phase: 'import_sessions', action: 'finish', count: imported });
      await yieldForUi();
    }

    const releasesResolved = await this.importAllPhaseResolveReleases(
      onProgress, onPhase, yieldForUi, phasesToSkip, gitRoot,
      lepOpts?.externalCounters?.releasesResolved ?? 0,
    );

    const releasesAnalyzed = await this.importAllPhaseAnalyzeReleases(
      onProgress, onPhase, yieldForUi, phasesToSkip, gitRoot, analyzeFn, excludePatterns,
    );

    const { coverageImported, currentCoverageImported } = await this.importAllPhaseImportCoverage(
      onProgress, onPhase, yieldForUi, phasesToSkip, gitRoot,
      lepOpts?.externalCounters?.coverageImported ?? 0,
      lepOpts?.externalCounters?.currentCoverageImported ?? 0,
    );

    // Rebuild session_costs from messages
    if (!phasesToSkip.has('rebuild_costs')) {
      onPhase?.({ phase: 'rebuild_costs', action: 'start' });
      await yieldForUi();
      try {
        onProgress?.('Rebuilding session costs...', 0);
        this.rebuildSessionCosts();
        onProgress?.('Session costs rebuilt', 0);
        onPhase?.({ phase: 'rebuild_costs', action: 'finish' });
      } catch (e) {
        onPhase?.({ phase: 'rebuild_costs', action: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      await yieldForUi();
    }

    // Analyze Claude Code behavior only for sessions that were (re)imported in this run.
    // Sessions skipped above had no new messages, so message_tool_calls is already current.
    // Phase 1 が外部に移管されている場合、対象 session 集合は externalSessionsToAnalyze から受け取る。
    const effectiveSessionsToAnalyze = lepOpts?.externalSessionsToAnalyze ?? sessionsToAnalyze;
    await this.importAllPhaseAnalyzeBehavior(onProgress, onPhase, yieldForUi, phasesToSkip, effectiveSessionsToAnalyze);

    // Rebuild daily_counts (6 kinds) after message_tool_calls is populated, then session_stats
    if (!phasesToSkip.has('rebuild_counts')) {
      onPhase?.({ phase: 'rebuild_counts', action: 'start' });
      await yieldForUi();
      try {
        onProgress?.('Rebuilding daily counts...', 0);
        this.rebuildDailyCounts();
        onProgress?.('Daily counts rebuilt', 0);
        onProgress?.('Rebuilding session stats...', 0);
        this.rebuildSessionStats();
        onProgress?.('Session stats rebuilt', 0);
        onPhase?.({ phase: 'rebuild_counts', action: 'finish' });
      } catch (e) {
        onPhase?.({ phase: 'rebuild_counts', action: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      await yieldForUi();
    }

    const messageCommitsBackfilled = await this.importAllPhaseBackfill(
      onProgress, onPhase, yieldForUi, phasesToSkip, gitRoot,
    );

    this.save();
    return {
      imported,
      skipped,
      commitsResolved,
      releasesResolved,
      releasesAnalyzed,
      coverageImported,
      currentCoverageImported,
      messageCommitsBackfilled,
    };
  }

  saveManualElement(
    repoName: string,
    input: { type: string; name: string; description?: string; external: boolean; parentId: string | null; serviceType?: string },
  ): string {
    const db = this.ensureDb();
    const prefix = this.getTypePrefix(input.type);
    const nextN = this.getNextManualSequence(repoName, prefix) + 1;
    const id = `${prefix}${nextN}`;
    const now = new Date().toISOString();
    // Phase E flip: c4_manual_elements は repo_id PK。Phase H-2: repo_name 列は撤去済。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `INSERT INTO c4_manual_elements
         (repo_id, element_id, type, name, description, external, parent_id, service_type, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [repoId, id, input.type, input.name, input.description ?? null, input.external ? 1 : 0, input.parentId, input.serviceType ?? null, now],
    );
    this.save();
    return id;
  }

  updateManualElement(
    repoName: string,
    elementId: string,
    changes: { name?: string; description?: string; external?: boolean; serviceType?: string },
  ): void {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    const sets: string[] = [];
    const vals: DbScalar[] = [];
    if (changes.name !== undefined) { sets.push('name = ?'); vals.push(changes.name); }
    if (changes.description !== undefined) { sets.push('description = ?'); vals.push(changes.description); }
    if (changes.external !== undefined) { sets.push('external = ?'); vals.push(changes.external ? 1 : 0); }
    if (changes.serviceType !== undefined) { sets.push('service_type = ?'); vals.push(changes.serviceType); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoId = this.repoIdForName(repoName);
    vals.push(now, repoId, elementId);
    db.run(
      `UPDATE c4_manual_elements SET ${sets.join(', ')} WHERE repo_id = ? AND element_id = ?`,
      vals,
    );
    this.save();
  }

  deleteManualElement(repoName: string, elementId: string): void {
    const db = this.ensureDb();
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `DELETE FROM c4_manual_relationships WHERE repo_id = ? AND (from_id = ? OR to_id = ?)`,
      [repoId, elementId, elementId],
    );
    db.run(
      `DELETE FROM c4_manual_elements WHERE repo_id = ? AND element_id = ?`,
      [repoId, elementId],
    );
    this.save();
  }

  getManualElements(repoName: string): readonly ManualElement[] {
    const db = this.ensureDb();
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const repoId = this.repoIdForNameReadonly(repoName);
    const result = db.exec(
      `SELECT element_id, type, name, description, external, parent_id, service_type, updated_at
         FROM c4_manual_elements WHERE repo_id = ? ORDER BY element_id`,
      [repoId],
    );
    const rows = result[0]?.values ?? [];
    return rows.map((row) => ({
      id: String(row[0]),
      type: String(row[1]) as ManualElement['type'],
      name: String(row[2]),
      description: row[3] == null ? undefined : asText(row[3]),
      external: Boolean(row[4]),
      parentId: row[5] == null ? null : asText(row[5]),
      serviceType: row[6] == null ? undefined : asText(row[6]),
      updatedAt: String(row[7]),
    }));
  }

  saveManualRelationship(
    repoName: string,
    input: { fromId: string; toId: string; label?: string; technology?: string },
  ): string {
    const db = this.ensureDb();
    const nextN = this.getNextManualSequence(repoName, 'rel_manual_') + 1;
    const id = `rel_manual_${nextN}`;
    const now = new Date().toISOString();
    // Phase E flip: c4_manual_relationships は repo_id PK。Phase H-2: repo_name 列は撤去済。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `INSERT INTO c4_manual_relationships
         (repo_id, rel_id, from_id, to_id, label, technology, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [repoId, id, input.fromId, input.toId, input.label ?? null, input.technology ?? null, now],
    );
    this.save();
    return id;
  }

  deleteManualRelationship(repoName: string, relId: string): void {
    const db = this.ensureDb();
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `DELETE FROM c4_manual_relationships WHERE repo_id = ? AND rel_id = ?`,
      [repoId, relId],
    );
    this.save();
  }

  getManualRelationships(repoName: string): readonly ManualRelationship[] {
    const db = this.ensureDb();
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const repoId = this.repoIdForNameReadonly(repoName);
    const result = db.exec(
      `SELECT rel_id, from_id, to_id, label, technology, updated_at
         FROM c4_manual_relationships WHERE repo_id = ? ORDER BY rel_id`,
      [repoId],
    );
    const rows = result[0]?.values ?? [];
    return rows.map((row) => ({
      id: String(row[0]),
      fromId: String(row[1]),
      toId: String(row[2]),
      label: row[3] == null ? undefined : asText(row[3]),
      technology: row[4] == null ? undefined : asText(row[4]),
      updatedAt: String(row[5]),
    }));
  }

  insertManualElementRaw(repoName: string, e: ManualElement): void {
    const db = this.ensureDb();
    // Phase E flip: repo_id PK。INSERT OR REPLACE は新 PK (repo_id, element_id) で衝突解決する。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `INSERT OR REPLACE INTO c4_manual_elements
         (repo_id, element_id, type, name, description, external, parent_id, service_type, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [repoId, e.id, e.type, e.name, e.description ?? null, e.external ? 1 : 0, e.parentId, e.serviceType ?? null, e.updatedAt],
    );
    this.save();
  }

  insertManualRelationshipRaw(repoName: string, r: ManualRelationship): void {
    const db = this.ensureDb();
    // Phase E flip: repo_id PK。INSERT OR REPLACE は新 PK (repo_id, rel_id) で衝突解決する。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `INSERT OR REPLACE INTO c4_manual_relationships
         (repo_id, rel_id, from_id, to_id, label, technology, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [repoId, r.id, r.fromId, r.toId, r.label ?? null, r.technology ?? null, r.updatedAt],
    );
    this.save();
  }

  insertManualGroupRaw(repoName: string, g: ManualGroup): void {
    const db = this.ensureDb();
    // Phase E flip: repo_id PK。INSERT OR REPLACE は新 PK (repo_id, group_id) で衝突解決する。
    const repoId = this.repoIdForName(repoName);
    db.run(
      `INSERT OR REPLACE INTO c4_manual_groups
         (repo_id, group_id, member_ids, label, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [repoId, g.id, JSON.stringify(g.memberIds), g.label ?? null, g.updatedAt],
    );
    this.save();
  }

  saveManualGroup(
    repoName: string,
    input: { memberIds: string[]; label?: string },
  ): string {
    const db = this.ensureDb();
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoId = this.repoIdForName(repoName);
    const result = db.exec(
      `SELECT group_id FROM c4_manual_groups WHERE repo_id = ? AND group_id LIKE 'grp_manual_%'`,
      [repoId],
    );
    const maxN = (result[0]?.values ?? []).reduce((m: number, row) => {
      const n = Number.parseInt(String(row[0]).substring('grp_manual_'.length), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const id = `grp_manual_${maxN + 1}`;
    const now = new Date().toISOString();
    // Phase E flip: c4_manual_groups は repo_id PK。Phase H-2: repo_name 列は撤去済。
    db.run(
      `INSERT INTO c4_manual_groups (repo_id, group_id, member_ids, label, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [repoId, id, JSON.stringify(input.memberIds), input.label ?? null, now],
    );
    this.save();
    return id;
  }

  updateManualGroup(
    repoName: string,
    groupId: string,
    changes: { memberIds?: string[]; label?: string | null },
  ): void {
    const db = this.ensureDb();
    const sets: string[] = ['updated_at = ?'];
    const values: DbScalar[] = [new Date().toISOString()];
    if (changes.memberIds !== undefined) { sets.push('member_ids = ?'); values.push(JSON.stringify(changes.memberIds)); }
    if ('label' in changes) { sets.push('label = ?'); values.push(changes.label ?? null); }
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoId = this.repoIdForName(repoName);
    values.push(repoId, groupId);
    db.run(`UPDATE c4_manual_groups SET ${sets.join(', ')} WHERE repo_id = ? AND group_id = ?`, values);
    this.save();
  }

  deleteManualGroup(repoName: string, groupId: string): void {
    const db = this.ensureDb();
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoId = this.repoIdForName(repoName);
    db.run(`DELETE FROM c4_manual_groups WHERE repo_id = ? AND group_id = ?`, [repoId, groupId]);
    this.save();
  }

  getManualGroups(repoName: string): readonly ManualGroup[] {
    const db = this.ensureDb();
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const repoId = this.repoIdForNameReadonly(repoName);
    const result = db.exec(
      `SELECT group_id, member_ids, label, updated_at FROM c4_manual_groups WHERE repo_id = ? ORDER BY group_id`,
      [repoId],
    );
    return (result[0]?.values ?? []).map((row) => ({
      id: String(row[0]),
      memberIds: JSON.parse(String(row[1])) as string[],
      label: row[2] == null ? undefined : asText(row[2]),
      updatedAt: String(row[3]),
    }));
  }

  private getTypePrefix(type: string): string {
    switch (type) {
      case 'person': return 'person_';
      case 'system': return 'sys_manual_';
      case 'container': return 'pkg_manual_';
      case 'component': return 'cmp_manual_';
      default: throw new Error(`Unknown manual element type: ${type}`);
    }
  }

  private getNextManualSequence(repoName: string, prefix: string): number {
    const db = this.ensureDb();
    const table = prefix === 'rel_manual_' ? 'c4_manual_relationships' : 'c4_manual_elements';
    const col = prefix === 'rel_manual_' ? 'rel_id' : 'element_id';
    // Phase H-2: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    const repoId = this.repoIdForName(repoName);
    const result = db.exec(
      `SELECT ${col} FROM ${table} WHERE repo_id = ? AND ${col} LIKE ?`,
      [repoId, `${prefix}%`],
    );
    const rows = result[0]?.values ?? [];
    let max = 0;
    for (const row of rows) {
      const id = String(row[0]);
      const n = Number.parseInt(id.substring(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  saveCurrentGraph(graph: TrailGraph, tsconfigPath: string, commitId: string, repoName: string): void {
    const db = this.ensureDb();
    this.maybeSnapshotKb('current_graphs');
    // Phase C-2 flip: current_graphs は repo_id PK。Phase H-3: repo_name 列は撤去済。
    const repoId = this.repoIdForName(repoName);
    const kbTotalsBefore = this.readKbGraphTotals(db, 'current_graphs', repoId);
    db.run(
      `INSERT OR REPLACE INTO current_graphs
         (repo_id, commit_id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [
        repoId,
        commitId,
        JSON.stringify(graph),
        tsconfigPath,
        graph.metadata.projectRoot,
        graph.metadata.analyzedAt,
      ],
    );
    if (kbTotalsBefore !== null) {
      this.auditKbShrink({
        table: 'current_graphs',
        repoName,
        before: kbTotalsBefore,
        after: graph.nodes.length + graph.edges.length,
      });
    }
    this.save();
  }

  /**
   * リポジトリの current グラフを取得する。
   * repoName 未指定時は、保存されているうち最初の1件（sqlite 既定順）を返す。
   */
  getCurrentGraph(repoName?: string): TrailGraph | null {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const result = repoName
      ? db.exec('SELECT graph_json FROM current_graphs WHERE repo_id = ?', [this.repoIdForNameReadonly(repoName)])
      : db.exec('SELECT graph_json FROM current_graphs LIMIT 1');
    const json = result[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    return JSON.parse(json) as TrailGraph;
  }

  getCurrentTsconfigPath(repoName?: string): string | null {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const result = repoName
      ? db.exec('SELECT tsconfig_path FROM current_graphs WHERE repo_id = ?', [this.repoIdForNameReadonly(repoName)])
      : db.exec('SELECT tsconfig_path FROM current_graphs LIMIT 1');
    const val = result[0]?.values?.[0]?.[0];
    return typeof val === 'string' ? val : null;
  }

  saveReleaseGraph(graph: TrailGraph, tsconfigPath: string, tag: string): void {
    const db = this.ensureDb();
    // release 側の上書き保存も保護対象（current 側との非対称防止）。デバウンスで過剰退避にはならない。
    this.maybeSnapshotKb('release_graphs');
    // flip 後 release_graphs は release_id PK。tag を解決してから保存する。
    const releaseId = this.releaseIdForTag(db, tag);
    if (releaseId == null) {
      this.logger.warn(`[saveReleaseGraph] no release for tag=${tag}, skip`);
      return;
    }
    db.run(
      `INSERT OR REPLACE INTO release_graphs
         (release_id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [
        releaseId,
        JSON.stringify(graph),
        tsconfigPath,
        graph.metadata.projectRoot,
        graph.metadata.analyzedAt,
      ],
    );
    this.save();
  }

  getReleaseGraph(tag: string): TrailGraph | null {
    const db = this.ensureDb();
    const result = db.exec(
      `SELECT rg.graph_json FROM release_graphs rg
        JOIN releases r ON r.release_id = rg.release_id
       WHERE r.tag = ?`,
      [tag],
    );
    const json = result[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    return JSON.parse(json) as TrailGraph;
  }

  // ---------------------------------------------------------------------------
  //  Decision comments (code_decision_comments) — analyze-child が抽出し
  //  memory-core が読む中継テーブル。repo 単位 wash-away。
  // ---------------------------------------------------------------------------

  /**
   * repo の decision comment を洗い替え保存する（既存を全削除 → 全行 INSERT）。
   * comment_hash は memory-core の Decision canonName と同式 sha1(repo:file:line:text)[0:16]。
   */
  saveDecisionComments(
    repoName: string,
    comments: ReadonlyArray<DecisionCommentInput>,
    opts: { commitSha?: string | null; recordedAt: string },
  ): void {
    const db = this.ensureDb();
    const repoId = this.repoIdForName(repoName);
    db.run('DELETE FROM code_decision_comments WHERE repo_id = ?', [repoId]);
    const commitSha = opts.commitSha ?? null;
    for (const c of comments) {
      const commentHash = createHash('sha1')
        .update(`${repoName}:${c.filePath}:${c.line}:${c.text}`)
        .digest('hex')
        .slice(0, 16);
      db.run(
        `INSERT OR IGNORE INTO code_decision_comments
           (repo_id, comment_hash, file_path, line, comment_text, symbol_name, commit_sha, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [repoId, commentHash, c.filePath, c.line, c.text, c.symbolName ?? null, commitSha, opts.recordedAt],
      );
    }
  }

  /** repo の decision comment を読み出す（memory-core の ingestDecisionComments 用）。 */
  getDecisionComments(repoName: string): DecisionCommentRow[] {
    const db = this.ensureDb();
    const repoId = this.repoIdForNameReadonly(repoName);
    const result = db.exec(
      `SELECT file_path, line, comment_text, symbol_name, commit_sha
         FROM code_decision_comments WHERE repo_id = ?`,
      [repoId],
    );
    return (result[0]?.values ?? []).map((row) => ({
      file_path: row[0] as string,
      line: row[1] as number,
      comment_text: row[2] as string,
      symbol_name: (row[3] as string | null) ?? null,
      commit_sha: (row[4] as string | null) ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  //  CodeGraph CRUD
  // ---------------------------------------------------------------------------

  saveCurrentCodeGraph(repoName: string, graph: CodeGraph): void {
    const db = this.ensureDb();
    this.maybeSnapshotKb('current_code_graphs');
    ensureCommunityStableKeyColumn(db, 'current_code_graph_communities');
    ensureCommunityMappingsJsonColumn(db, 'current_code_graph_communities');
    // Phase C-2 flip: current_code_graphs / current_code_graph_communities は repo_id PK。
    // Phase H-3: repo_name 列は撤去済 (repo フィルタは repo_id = ? で行う)。
    const repoId = this.repoIdForName(repoName);
    const kbTotalsBefore = this.readKbGraphTotals(db, 'current_code_graphs', repoId);
    const kbCommunityRowsBefore = this.countCommunityRows(db, repoId);
    const { stored, communities } = splitCodeGraph(graph);

    // ジャッカード引き継ぎ: DELETE/INSERT で community_id が再採番される前に、
    // 旧スナップショット（members 集合 + name / summary / mappings_json）を読み出して引き継ぎ表を構築する。
    const oldCommunities = this.readCommunitiesForCarryOver(db, repoId);
    const newCommunities: NewCommunity[] = communities.map((c) => ({
      id: c.id,
      stableKey: c.stableKey,
      members: collectMembersForCommunity(graph.nodes, c.id),
    }));
    const carryOver = resolveCarryOver(oldCommunities, newCommunities);

    db.run(
      `INSERT OR REPLACE INTO current_code_graphs
         (repo_id, graph_json, generated_at, updated_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [repoId, JSON.stringify(stored), stored.generatedAt],
    );
    // 新しいグラフに存在しない古いコミュニティを削除。mappings_json などは Step 1/2 で carryOver に退避済み。
    if (communities.length === 0) {
      db.run('DELETE FROM current_code_graph_communities WHERE repo_id = ?', [repoId]);
    } else {
      const placeholders = communities.map(() => '?').join(',');
      db.run(
        `DELETE FROM current_code_graph_communities WHERE repo_id = ? AND community_id NOT IN (${placeholders})`,
        [repoId, ...communities.map((c) => c.id)],
      );
    }
    // label / stable_key は常に最新を採用。
    // name/summary は (1) 引き継ぎ表 (2) 既存値 (3) 新規空文字 の順で解決する。
    // mappings_json も引き継ぎ表から復元する（既存 ON CONFLICT 句は mappings_json を触らない設計のため、
    // INSERT 時の VALUES に直接埋めて NULL 上書きを防ぐ）。
    const stmt = db.prepare(
      `INSERT INTO current_code_graph_communities
         (repo_id, community_id, label, name, summary, stable_key, mappings_json, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(repo_id, community_id) DO UPDATE SET
         label      = excluded.label,
         name       = CASE WHEN excluded.name    != '' THEN excluded.name    ELSE name    END,
         summary    = CASE WHEN excluded.summary != '' THEN excluded.summary ELSE summary END,
         stable_key = excluded.stable_key,
         mappings_json = COALESCE(excluded.mappings_json, mappings_json),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    );
    for (const c of communities) {
      const co = carryOver.get(c.id);
      const effectiveName = c.name === '' ? (co?.name ?? '') : c.name;
      const effectiveSummary = c.summary === '' ? (co?.summary ?? '') : c.summary;
      const effectiveMappingsJson = co?.mappingsJson ?? null;
      stmt.run([repoId, c.id, c.label, effectiveName, effectiveSummary, c.stableKey, effectiveMappingsJson]);
    }
    stmt.free();
    if (kbTotalsBefore !== null) {
      this.auditKbShrink({
        table: 'current_code_graphs',
        repoName,
        before: kbTotalsBefore,
        after: stored.nodes.length + stored.edges.length,
      });
    }
    if (kbCommunityRowsBefore !== null) {
      this.auditKbShrink({
        table: 'current_code_graph_communities',
        repoName,
        before: kbCommunityRowsBefore,
        after: communities.length,
      });
    }
    this.save();
  }

  /** current_code_graph_communities の repo 内行数（Shrink Audit の書込前カウント用。行なしは null）。 */
  private countCommunityRows(db: Database, repoId: number): number | null {
    const result = db.exec('SELECT COUNT(*) FROM current_code_graph_communities WHERE repo_id = ?', [repoId]);
    const count = Number(result[0]?.values?.[0]?.[0] ?? 0);
    return count > 0 ? count : null;
  }

  /**
   * 旧コミュニティの引き継ぎに必要な情報（members 集合 + name / summary / mappings_json + stableKey）を
   * `current_code_graphs.graph_json` と `current_code_graph_communities` から再構築する。
   * graph_json から community_id ごとの members を集計し、別テーブル列と join する。
   */
  private readCommunitiesForCarryOver(db: Database, repoId: number): readonly OldCommunity[] {
    // graph_json から members 集合を取得 (Phase C-2 flip: repo_id で参照する)
    const graphResult = db.exec(
      'SELECT graph_json FROM current_code_graphs WHERE repo_id = ?',
      [repoId],
    );
    const json = graphResult[0]?.values?.[0]?.[0];
    const membersByCommunity = new Map<number, Set<string>>();
    if (typeof json === 'string') {
      try {
        const stored = JSON.parse(json) as { nodes?: ReadonlyArray<{ id: string; community: number }> };
        for (const n of stored.nodes ?? []) {
          const set = membersByCommunity.get(n.community) ?? new Set<string>();
          set.add(n.id);
          membersByCommunity.set(n.community, set);
        }
      } catch {
        // 破損 JSON は引き継ぎ無しで進む（DELETE 後に mappings 喪失するが、新規生成と同等の挙動）
      }
    }

    // メタ列を読み出し
    const hasStableKey = columnExists(db, 'current_code_graph_communities', 'stable_key');
    const hasMappings = columnExists(db, 'current_code_graph_communities', 'mappings_json');
    const cols = [
      'community_id',
      'name',
      'summary',
      ...(hasStableKey ? ['stable_key'] : []),
      ...(hasMappings ? ['mappings_json'] : []),
    ];
    const result = db.exec(
      `SELECT ${cols.join(', ')} FROM current_code_graph_communities WHERE repo_id = ?`,
      [repoId],
    );
    const idx = (col: string) => cols.indexOf(col);

    const olds: OldCommunity[] = [];
    for (const row of result[0]?.values ?? []) {
      const communityId = Number(row[idx('community_id')] ?? 0);
      const sIdx = idx('stable_key');
      const mIdx = idx('mappings_json');
      const rawMappings = mIdx >= 0 ? row[mIdx] : null;
      olds.push({
        communityId,
        stableKey: sIdx >= 0 ? asText(row[sIdx] ?? '') : '',
        members: membersByCommunity.get(communityId) ?? new Set<string>(),
        name: asText(row[idx('name')] ?? ''),
        summary: asText(row[idx('summary')] ?? ''),
        mappingsJson: rawMappings == null ? null : asText(rawMappings),
      });
    }
    return olds;
  }

  getCurrentCodeGraph(repoName: string): CodeGraph | null {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const repoId = this.repoIdForNameReadonly(repoName);
    const graphResult = db.exec(
      'SELECT graph_json FROM current_code_graphs WHERE repo_id = ?',
      [repoId],
    );
    const json = graphResult[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    const stored = JSON.parse(json) as import('@anytime-markdown/trail-core/codeGraph').StoredCodeGraph;
    const hasStableKey = columnExists(db, 'current_code_graph_communities', 'stable_key');
    const select = hasStableKey
      ? 'SELECT community_id, label, name, summary, stable_key FROM current_code_graph_communities WHERE repo_id = ?'
      : 'SELECT community_id, label, name, summary FROM current_code_graph_communities WHERE repo_id = ?';
    const commResult = db.exec(select, [repoId]);
    const communities: StoredCommunity[] = (commResult[0]?.values ?? []).map((row) => ({
      id: row[0] as number,
      label: row[1] as string,
      name: row[2] as string,
      summary: row[3] as string,
      stableKey: hasStableKey ? asText(row[4] ?? '') : '',
    }));
    return composeCodeGraph(stored, communities);
  }

  getAllCurrentCodeGraphRaws(): Array<{ repo_id: number; repo_name: string; graph_json: string; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    // Phase H-3: repo_name は current_code_graphs に無い。repos を LEFT JOIN して射影する (結果キーは不変)。
    // 未解決 repo_id (0/NULL) 行も同期から落とさないため LEFT JOIN + COALESCE(r.repo_name, '')。
    // Supabase 正規化ミラー用に repo_id も additive 投影する (repo_name は拡張ローカル UI 互換のため保持)。
    const result = db.exec(
      `SELECT g.repo_id, COALESCE(r.repo_name, '') AS repo_name, g.graph_json, g.generated_at, g.updated_at
       FROM current_code_graphs g LEFT JOIN repos r ON r.repo_id = g.repo_id`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_id: Number(r[0] ?? 0),
      repo_name: asText(r[1] ?? ''),
      graph_json: asText(r[2] ?? ''),
      generated_at: asText(r[3] ?? ''),
      updated_at: asText(r[4] ?? ''),
    }));
  }

  getAllCurrentCodeGraphCommunityRaws(): Array<{ repo_id: number; repo_name: string; community_id: number; label: string; name: string; summary: string; mappings_json: string | null; stable_key: string; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)');
    const colNames = new Set((cols[0]?.values ?? []).map((r) => String(r[1])));
    const hasMappings = colNames.has('mappings_json');
    const hasStableKey = colNames.has('stable_key');
    const selectCols = [
      'repo_id',
      'repo_name',
      'community_id',
      'label',
      'name',
      'summary',
      ...(hasMappings ? ['mappings_json'] : []),
      ...(hasStableKey ? ['stable_key'] : []),
      'generated_at',
      'updated_at',
    ];
    // Phase H-3: repo_name は current_code_graph_communities に無い。repos を LEFT JOIN して射影する
    // (結果キー名・順序は不変)。repo_name は r、それ以外は c (communities) から取る。未解決 repo_id
    // (0/NULL) 行も同期から落とさないため LEFT JOIN + COALESCE(r.repo_name, '')。
    const projected = selectCols
      .map((col) => (col === 'repo_name' ? "COALESCE(r.repo_name, '')" : `c.${col}`))
      .join(', ');
    const result = db.exec(
      `SELECT ${projected} FROM current_code_graph_communities c LEFT JOIN repos r ON r.repo_id = c.repo_id`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => {
      const idx = (col: string) => selectCols.indexOf(col);
      const mIdx = idx('mappings_json');
      const sIdx = idx('stable_key');
      const rawMappings = mIdx >= 0 ? r[mIdx] : null;
      return {
        repo_id: Number(r[idx('repo_id')] ?? 0),
        repo_name: asText(r[idx('repo_name')] ?? ''),
        community_id: Number(r[idx('community_id')] ?? 0),
        label: asText(r[idx('label')] ?? ''),
        name: asText(r[idx('name')] ?? ''),
        summary: asText(r[idx('summary')] ?? ''),
        mappings_json: rawMappings == null ? null : asText(rawMappings),
        stable_key: sIdx >= 0 ? asText(r[sIdx] ?? '') : '',
        generated_at: asText(r[idx('generated_at')] ?? ''),
        updated_at: asText(r[idx('updated_at')] ?? ''),
      };
    });
  }

  getAllReleaseCodeGraphRaws(): Array<{ release_id: number; release_tag: string; graph_json: string; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    // flip 後は release_id FK。Supabase 同期は tag キーのため releases へ JOIN して tag を供給する。
    // Supabase 正規化ミラー用に r.release_id も additive 投影する (release_tag は互換のため保持)。
    const result = db.exec(
      `SELECT r.tag, rcg.graph_json, rcg.generated_at, rcg.updated_at, r.release_id
         FROM release_code_graphs rcg
         JOIN releases r ON r.release_id = rcg.release_id`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: asText(r[0] ?? ''),
      graph_json: asText(r[1] ?? ''),
      generated_at: asText(r[2] ?? ''),
      updated_at: asText(r[3] ?? ''),
      release_id: Number(r[4] ?? 0),
    }));
  }

  getAllReleaseCodeGraphCommunityRaws(): Array<{ release_id: number; release_tag: string; community_id: number; label: string; name: string; summary: string; stable_key: string; generated_at: string; updated_at: string }> {
    const db = this.ensureDb();
    const hasStableKey = columnExists(db, 'release_code_graph_communities', 'stable_key');
    // flip 後は release_id FK。Supabase 同期は tag キーのため releases へ JOIN して tag を供給する。
    // Supabase 正規化ミラー用に r.release_id を末尾へ additive 投影する (release_tag は互換のため保持)。
    const sql = hasStableKey
      ? `SELECT r.tag, rcgc.community_id, rcgc.label, rcgc.name, rcgc.summary, rcgc.stable_key, rcgc.generated_at, rcgc.updated_at, r.release_id
           FROM release_code_graph_communities rcgc JOIN releases r ON r.release_id = rcgc.release_id`
      : `SELECT r.tag, rcgc.community_id, rcgc.label, rcgc.name, rcgc.summary, rcgc.generated_at, rcgc.updated_at, r.release_id
           FROM release_code_graph_communities rcgc JOIN releases r ON r.release_id = rcgc.release_id`;
    const result = db.exec(sql);
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: asText(r[0] ?? ''),
      community_id: Number(r[1] ?? 0),
      label: asText(r[2] ?? ''),
      name: asText(r[3] ?? ''),
      summary: asText(r[4] ?? ''),
      stable_key: hasStableKey ? asText(r[5] ?? '') : '',
      generated_at: asText(r[hasStableKey ? 6 : 5] ?? ''),
      updated_at: asText(r[hasStableKey ? 7 : 6] ?? ''),
      release_id: Number(r[hasStableKey ? 8 : 7] ?? 0),
    }));
  }

  upsertCurrentCodeGraphCommunities(
    repoName: string,
    communities: ReadonlyArray<{ community_id: number; label?: string; name: string; summary: string; stable_key?: string }>,
  ): void {
    const db = this.ensureDb();
    // 行単位 REPLACE で行数は減らないため Shrink Audit は不要だが、
    // AI 生成の name / summary を上書きする前の状態を snapshot が保護する。
    this.maybeSnapshotKb('current_code_graph_communities');
    ensureCommunityStableKeyColumn(db, 'current_code_graph_communities');
    ensureCommunityMappingsJsonColumn(db, 'current_code_graph_communities');
    // Phase C-2 flip: PK は (repo_id, community_id)。Phase H-3: repo_name 列は撤去済。
    const repoId = this.repoIdForName(repoName);
    for (const c of communities) {
      // 既存行から失われたくない列（label / stable_key / mappings_json）を退避してから INSERT OR REPLACE する。
      // INSERT OR REPLACE は SQLite で「DELETE → INSERT」になり、VALUES に含めない列は NULL / DEFAULT に上書きされてしまうため。
      const existing = db.exec(
        'SELECT label, stable_key, mappings_json FROM current_code_graph_communities WHERE repo_id = ? AND community_id = ?',
        [repoId, c.community_id],
      );
      const row = existing[0]?.values?.[0];
      const existingLabel = row?.[0] as string | undefined;
      const existingStableKey = row?.[1] as string | undefined;
      const existingMappingsJson = row?.[2] as string | undefined;
      db.run(
        `INSERT OR REPLACE INTO current_code_graph_communities
           (repo_id, community_id, label, name, summary, stable_key, mappings_json, generated_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        [
          repoId,
          c.community_id,
          c.label ?? existingLabel ?? '',
          c.name,
          c.summary,
          c.stable_key ?? existingStableKey ?? '',
          existingMappingsJson ?? null,
        ],
      );
    }
    this.save();
  }

  /**
   * AI 後処理スキル（anytime-reverse-engineer）からコミュニティの name/summary を upsert する。
   * 既存の `upsertCurrentCodeGraphCommunities` は同期サービス用（label 含む全項目を上書き）なので、
   * 命名のみを更新する API として独立。mappings_json は触らないので保持される。
   */
  upsertCurrentCodeGraphCommunitySummaries(
    repoName: string,
    rows: ReadonlyArray<{ communityId: number; name: string; summary: string }>,
  ): { updated: number } {
    const db = this.ensureDb();
    // Phase C-2 flip: PK は (repo_id, community_id)。Phase H-3: repo_name 列は撤去済。
    const repoId = this.repoIdForName(repoName);
    for (const r of rows) {
      db.run(
        `INSERT INTO current_code_graph_communities
           (repo_id, community_id, label, name, summary, generated_at, updated_at)
         VALUES (?, ?, '', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(repo_id, community_id) DO UPDATE SET
           name = excluded.name,
           summary = excluded.summary,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        [repoId, r.communityId, r.name, r.summary],
      );
    }
    this.save();
    return { updated: rows.length };
  }

  /**
   * AI 後処理スキルからコミュニティ別の C4 要素 role マッピングを upsert する。
   * `mappings_json` カラムが未存在の DB（古いスキーマ）では ALTER TABLE で追加する。
   */
  upsertCurrentCodeGraphCommunityMappings(
    repoName: string,
    rows: ReadonlyArray<{
      communityId: number;
      mappings: ReadonlyArray<{ elementId: string; elementType: string; role: 'primary' | 'secondary' | 'dependency' }>;
    }>,
  ): { updated: number; inserted: number } {
    const db = this.ensureDb();

    // mappings_json / stable_key カラム保証（初回マイグレーション）
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)')[0]?.values ?? [];
    const colNames = new Set(cols.map((c) => String(c[1])));
    if (!colNames.has('mappings_json')) {
      db.run('ALTER TABLE current_code_graph_communities ADD COLUMN mappings_json TEXT');
    }
    ensureCommunityStableKeyColumn(db, 'current_code_graph_communities');
    // Phase C-2 flip: PK は (repo_id, community_id)。Phase H-3: repo_name 列は撤去済。
    const repoId = this.repoIdForName(repoName);

    let updated = 0;
    let inserted = 0;
    for (const r of rows) {
      const exists = db.exec(
        'SELECT 1 FROM current_code_graph_communities WHERE repo_id = ? AND community_id = ?',
        [repoId, r.communityId],
      );
      const found = (exists[0]?.values?.length ?? 0) > 0;
      db.run(
        `INSERT INTO current_code_graph_communities
           (repo_id, community_id, label, name, summary, generated_at, updated_at, mappings_json)
         VALUES (?, ?, '', '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
         ON CONFLICT(repo_id, community_id) DO UPDATE SET
           mappings_json = excluded.mappings_json,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        [repoId, r.communityId, JSON.stringify(r.mappings)],
      );
      if (found) updated++;
      else inserted++;
    }
    this.save();
    return { updated, inserted };
  }

  /**
   * 指定リポジトリの全コミュニティ行を返す（label/name/summary/mappings_json 込み）。
   * `mappings_json` カラムが無いスキーマでは null を返す。
   */
  listCurrentCodeGraphCommunities(
    repoName: string,
  ): ReadonlyArray<{
    readonly communityId: number;
    readonly label: string;
    readonly name: string;
    readonly summary: string;
    readonly mappingsJson: string | null;
    readonly stableKey: string;
  }> {
    const db = this.ensureDb();
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)')[0]?.values ?? [];
    const colNames = new Set(cols.map((c) => String(c[1])));
    const hasMappings = colNames.has('mappings_json');
    const hasStableKey = colNames.has('stable_key');
    const selectCols = [
      'community_id',
      'label',
      'name',
      'summary',
      ...(hasMappings ? ['mappings_json'] : []),
      ...(hasStableKey ? ['stable_key'] : []),
    ];
    // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const repoId = this.repoIdForNameReadonly(repoName);
    const sql = `SELECT ${selectCols.join(', ')} FROM current_code_graph_communities WHERE repo_id = ? ORDER BY community_id`;
    const result = db.exec(sql, [repoId]);
    return (result[0]?.values ?? []).map((row) => {
      const idx = (col: string) => selectCols.indexOf(col);
      const mIdx = idx('mappings_json');
      const sIdx = idx('stable_key');
      const rawMappings = mIdx >= 0 ? row[mIdx] : null;
      return {
        communityId: Number(row[idx('community_id')]),
        label: asText(row[idx('label')] ?? ''),
        name: asText(row[idx('name')] ?? ''),
        summary: asText(row[idx('summary')] ?? ''),
        mappingsJson: rawMappings == null ? null : asText(rawMappings),
        stableKey: sIdx >= 0 ? asText(row[sIdx] ?? '') : '',
      };
    });
  }

  saveReleaseCodeGraph(tag: string, graph: CodeGraph): void {
    const db = this.ensureDb();
    // release 側の上書き保存も保護対象（current 側との非対称防止）。デバウンスで過剰退避にはならない。
    this.maybeSnapshotKb('release_code_graphs');
    ensureCommunityStableKeyColumn(db, 'release_code_graph_communities');
    // flip 後は release_id FK。tag を解決してから保存する。
    const releaseId = this.releaseIdForTag(db, tag);
    if (releaseId == null) {
      this.logger.warn(`[saveReleaseCodeGraph] no release for tag=${tag}, skip`);
      return;
    }
    const { stored, communities } = splitCodeGraph(graph);
    db.run(
      `INSERT OR REPLACE INTO release_code_graphs
         (release_id, graph_json, generated_at, updated_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      [releaseId, JSON.stringify(stored), stored.generatedAt],
    );
    db.run('DELETE FROM release_code_graph_communities WHERE release_id = ?', [releaseId]);
    const stmt = db.prepare(
      `INSERT INTO release_code_graph_communities
         (release_id, community_id, label, name, summary, stable_key, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    );
    for (const c of communities) {
      stmt.run([releaseId, c.id, c.label, c.name, c.summary, c.stableKey]);
    }
    stmt.free();
    this.save();
  }

  getReleaseCodeGraph(tag: string): CodeGraph | null {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, tag);
    if (releaseId == null) return null;
    const graphResult = db.exec(
      'SELECT graph_json FROM release_code_graphs WHERE release_id = ?',
      [releaseId],
    );
    const json = graphResult[0]?.values?.[0]?.[0];
    if (typeof json !== 'string') return null;
    const stored = JSON.parse(json) as import('@anytime-markdown/trail-core/codeGraph').StoredCodeGraph;
    const hasStableKey = columnExists(db, 'release_code_graph_communities', 'stable_key');
    const sql = hasStableKey
      ? 'SELECT community_id, label, name, summary, stable_key FROM release_code_graph_communities WHERE release_id = ?'
      : 'SELECT community_id, label, name, summary FROM release_code_graph_communities WHERE release_id = ?';
    const commResult = db.exec(sql, [releaseId]);
    const communities: StoredCommunity[] = (commResult[0]?.values ?? []).map((row) => ({
      id: row[0] as number,
      label: row[1] as string,
      name: row[2] as string,
      summary: row[3] as string,
      stableKey: hasStableKey ? asText(row[4] ?? '') : '',
    }));
    return composeCodeGraph(stored, communities);
  }

  deleteCurrentCodeGraphs(): void {
    const db = this.ensureDb();
    // 意図的な全消去のため Shrink Audit は掛けない（常に誤警報になる）。snapshot のみ。
    this.maybeSnapshotKb('current_code_graphs');
    db.run('DELETE FROM current_code_graph_communities');
    db.run('DELETE FROM current_code_graphs');
    this.save();
  }

  deleteReleaseCodeGraphs(): void {
    const db = this.ensureDb();
    // 意図的な全消去のため Shrink Audit は掛けない（常に誤警報になる）。snapshot のみ。
    this.maybeSnapshotKb('release_code_graphs');
    db.run('DELETE FROM release_code_graph_communities');
    db.run('DELETE FROM release_code_graphs');
    this.save();
  }

  analyzeReleaseCodeGraphsForce(opts: {
    codeGraphService: { generate: (onProgress?: (phase: string, percent: number) => void) => Promise<CodeGraph[]> };
    gitRoot: string;
    onProgress?: (msg: string) => void;
  }): Promise<number> {
    const releases = this.getReleases();
    if (releases.length === 0) return Promise.resolve(0);

    const git = new ExecFileGitService(opts.gitRoot);
    let count = 0;

    const runNext = async (i: number): Promise<number> => {
      if (i >= releases.length) return count;
      const release = releases[i];
      const tag = release.tag;
      const tmpDir = path.join(os.tmpdir(), `trail-cg-release-${tag.replaceAll('/', '-')}`);
      try {
        opts.onProgress?.(`Generating code graph for release ${tag}...`);
        if (fs.existsSync(tmpDir)) {
          try {
            execFileSync('git', ['worktree', 'remove', tmpDir, '--force'], { cwd: opts.gitRoot, stdio: 'pipe' });
          } catch {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
          }
        }
        const commitHash = git.getTagCommitHash(tag);
        execFileSync('git', ['worktree', 'add', '--detach', tmpDir, commitHash], { cwd: opts.gitRoot, stdio: 'pipe' });
        const worktreeNodeModules = path.join(tmpDir, 'node_modules');
        if (!fs.existsSync(worktreeNodeModules)) {
          fs.symlinkSync(path.join(opts.gitRoot, 'node_modules'), worktreeNodeModules, 'dir');
        }
        // generate() は per-repo の CodeGraph 配列を返す。release_code_graphs は
        // tag 単位（リポジトリ単位ではない）に 1 グラフを保存する設計のため、
        // 先頭リポジトリのグラフを採用する。空配列ならこの tag はスキップする。
        const graphs = await opts.codeGraphService.generate();
        const graph = graphs[0];
        if (!graph) {
          opts.onProgress?.(`Skipping ${tag}: no code graph generated`);
          return runNext(i + 1);
        }
        this.saveReleaseCodeGraph(tag, graph);
        count++;
        opts.onProgress?.(`Release ${tag}: code graph saved`);
      } catch (e) {
        opts.onProgress?.(`Skipping ${tag}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        try {
          execFileSync('git', ['worktree', 'remove', tmpDir, '--force'], { cwd: opts.gitRoot, stdio: 'pipe' });
        } catch {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      }
      return runNext(i + 1);
    };
    return runNext(0);
  }

  /**
   * 互換ラッパー: id='current' なら current_graphs、それ以外は release_graphs から取得する。
   * id='current' の場合、repoName が指定されていればそのリポジトリを、未指定なら最初の1件を返す。
   */
  getTrailGraph(id = 'current', repoName?: string): TrailGraph | null {
    return id === 'current' ? this.getCurrentGraph(repoName) : this.getReleaseGraph(id);
  }

  /**
   * このローカル DB を IC4ModelStore として公開するアダプタを返す。
   * TrailGraph → C4Model 変換（trailToC4）はこのアダプタ内で実行する。
   */
  asC4ModelStore(): IC4ModelStore {
    return {
      getCurrentC4Model: (repoName: string): C4ModelResult | null => {
        const graph = this.getCurrentGraph(repoName);
        if (!graph) return null;
        const model = trailToC4(graph);
        const info = this.getCurrentGraphCommit(repoName);
        return { model, commitId: info?.commitId };
      },
      getReleaseC4Model: (tag: string): C4ModelResult | null => {
        const graph = this.getReleaseGraph(tag);
        if (!graph) return null;
        return { model: trailToC4(graph) };
      },
      getC4ModelEntries: (): readonly C4ModelEntry[] => {
        return this.getTrailGraphEntries();
      },
    };
  }

  /**
   * 全 current_graphs 行を返す（洗い替え同期用）。
   */
  listCurrentGraphs(): Array<{ repoId: number; repoName: string; commitId: string; graph: TrailGraph }> {
    const db = this.ensureDb();
    // Phase H-3: repo_name は current_graphs に無い。repos を LEFT JOIN して射影する (結果キーは不変)。
    // 未解決 repo_id (0/NULL) 行も同期から落とさないため LEFT JOIN + COALESCE(r.repo_name, '')。
    // Supabase 正規化ミラー用に repoId も additive 提供する (repoName は拡張ローカル UI 互換のため保持)。
    const result = db.exec(
      `SELECT g.repo_id, COALESCE(r.repo_name, '') AS repo_name, g.commit_id, g.graph_json
       FROM current_graphs g LEFT JOIN repos r ON r.repo_id = g.repo_id`,
    );
    const rows = result[0]?.values ?? [];
    const out: Array<{ repoId: number; repoName: string; commitId: string; graph: TrailGraph }> = [];
    for (const row of rows) {
      const repoId = Number(row[0] ?? 0);
      const repoName = asText(row[1] ?? '');
      const commitId = asText(row[2] ?? '');
      const json = row[3];
      if (typeof json !== 'string') continue;
      try {
        out.push({ repoId, repoName, commitId, graph: JSON.parse(json) as TrailGraph });
      } catch (e) {
        this.logger.warn(`listCurrentGraphs: failed to parse graph_json for repo=${repoName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return out;
  }

  /**
   * 直近 windowDays 日に変更されたファイルから時間的結合（Ghost Edge）を計算する。
   * 静的依存ペア（current_graphs.graph_json から抽出）は excludePairs として除外する。
   * directional: true の場合は方向性付き Confidence ベースのエッジを返す。
   */
  fetchTemporalCoupling(options: FetchTemporalCouplingOptions & { directional?: false }): TemporalCouplingEdge[];
  fetchTemporalCoupling(options: FetchTemporalCouplingOptions & { directional: true }): ConfidenceCouplingEdge[];
  fetchTemporalCoupling(
    options: FetchTemporalCouplingOptions,
  ): TemporalCouplingEdge[] | ConfidenceCouplingEdge[] {
    const db = this.ensureDb();
    const {
      repoName,
      windowDays,
      directional = false,
      confidenceThreshold = 0.5,
      directionalDiffThreshold = 0.3,
      granularity = 'commit',
    } = options;

    // 粒度別デフォルト
    const isSession = granularity === 'session';
    const isSubagentType = granularity === 'subagentType';
    // subagentType は集約数が極端に少ない（実用 2〜6 型）。minChangeCount=2 にすると
    // 「2 つ以上の型に跨って触られたファイル」のみが eligible になり、
    // 役割別に専門領域が分かれる典型ケースで eligibleFiles.size<2 短絡 → 0 件となる。
    // そのため minChangeCount=1（すべてのファイルを eligible 化）にし、
    // 各 subagent_type の内部で co-edit ペアを描画する。
    const defaultMinChangeCountForNonSubagent = isSession ? 3 : 5;
    const defaultMinChangeCount = isSubagentType ? 1 : defaultMinChangeCountForNonSubagent;
    const minChangeCount = options.minChangeCount ?? defaultMinChangeCount;
    const defaultJaccardForNonSubagent = isSession ? 0.4 : 0.5;
    const defaultJaccardThreshold = isSubagentType ? 0.5 : defaultJaccardForNonSubagent;
    const jaccardThreshold = options.jaccardThreshold ?? defaultJaccardThreshold;
    const topK = options.topK ?? 50;
    // subagentType は 1 型あたり数百〜数千ファイルになる（general-purpose は半年で 500+）。
    // maxFilesPerGroup を絞ると「巨大な役割」が丸ごとスキップされ実質 0 件になる典型ケースを生む。
    // ペア計算は内部 Map で N^2 だが N=2000 なら 2M ペアで in-memory に収まるため Infinity 相当の上限にする。
    const maxFilesPerGroupWhenSession = isSession ? 20 : 50;
    const maxFilesPerGroup = isSubagentType ? 5000 : maxFilesPerGroupWhenSession;

    const now = new Date();
    const toIso = now.toISOString();
    const fromIso = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    const excludePairs = this.buildStaticDependencyPairs(repoName);

    const tcParams = {
      db, fromIso, toIso, directional, minChangeCount, jaccardThreshold,
      confidenceThreshold, directionalDiffThreshold, topK, maxFilesPerGroup, excludePairs,
    };

    if (isSession) {
      return this.fetchTemporalCouplingSession(tcParams);
    }

    if (isSubagentType) {
      return this.fetchTemporalCouplingSubagentType(tcParams);
    }

    // commit 粒度 (Phase 1/2)
    const result = db.exec(
      `SELECT cf.commit_hash, cf.file_path
       FROM commit_files cf
       WHERE cf.commit_hash IN (
         SELECT DISTINCT commit_hash FROM session_commits
         WHERE committed_at >= ? AND committed_at <= ?
       )
       ORDER BY cf.commit_hash`,
      [fromIso, toIso],
    );
    const values = result[0]?.values ?? [];
    const rows: CommitFileRow[] = values.map((r) => ({
      commitHash: asText(r[0] ?? ''),
      filePath: asText(r[1] ?? ''),
    }));

    if (directional) {
      return computeConfidenceCoupling(rows, {
        minChangeCount,
        confidenceThreshold,
        directionalDiffThreshold,
        topK,
        maxFilesPerCommit: maxFilesPerGroup,
        excludePairs,
        pathFilter: defaultTemporalCouplingPathFilter,
      });
    }

    return computeTemporalCoupling(rows, {
      minChangeCount,
      jaccardThreshold,
      topK,
      maxFilesPerCommit: maxFilesPerGroup,
      excludePairs,
      pathFilter: defaultTemporalCouplingPathFilter,
    });
  }

  private fetchTemporalCouplingSession(p: {
    db: Database; fromIso: string; toIso: string; directional: boolean;
    minChangeCount: number; jaccardThreshold: number; confidenceThreshold: number;
    directionalDiffThreshold: number; topK: number; maxFilesPerGroup: number;
    excludePairs: ReadonlyArray<readonly [string, string]>;
  }): TemporalCouplingEdge[] | ConfidenceCouplingEdge[] {
    const { db, fromIso, toIso, directional, minChangeCount, jaccardThreshold,
      confidenceThreshold, directionalDiffThreshold, topK, maxFilesPerGroup, excludePairs } = p;
    const editToolPlaceholders = SESSION_COUPLING_EDIT_TOOLS.map(() => '?').join(', ');
    const result = db.exec(
      `SELECT mtc.session_id, mtc.file_path
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.tool_name IN (${editToolPlaceholders})
         AND mtc.file_path IS NOT NULL
         AND mtc.file_path != ''
         AND s.start_time >= ? AND s.start_time <= ?
       ORDER BY mtc.session_id`,
      [...SESSION_COUPLING_EDIT_TOOLS, fromIso, toIso],
    );
    const values = result[0]?.values ?? [];

    const projectRootCandidates = Array.from(
      new Set(
        this.listCurrentGraphs()
          .map((g) => g.graph?.metadata?.projectRoot)
          .filter((p): p is string => typeof p === 'string' && p.length > 0),
      ),
    ).sort((a, b) => a.length - b.length);
    const normalize = this.buildFilePathNormalizer(projectRootCandidates);

    const sessionRows: SessionFileRow[] = [];
    for (const r of values) {
      const sessionId = asText(r[0] ?? '');
      const normalized = normalize(asText(r[1] ?? ''));
      if (sessionId && normalized) {
        sessionRows.push({ sessionId, filePath: normalized });
      }
    }

    if (directional) {
      return computeSessionConfidenceCoupling(sessionRows, {
        minChangeCount, confidenceThreshold, directionalDiffThreshold, topK,
        maxFilesPerCommit: maxFilesPerGroup, excludePairs, pathFilter: defaultTemporalCouplingPathFilter,
      });
    }
    return computeSessionCoupling(sessionRows, {
      minChangeCount, jaccardThreshold, topK,
      maxFilesPerCommit: maxFilesPerGroup, excludePairs, pathFilter: defaultTemporalCouplingPathFilter,
    });
  }

  private fetchTemporalCouplingSubagentType(p: {
    db: Database; fromIso: string; toIso: string; directional: boolean;
    minChangeCount: number; jaccardThreshold: number; confidenceThreshold: number;
    directionalDiffThreshold: number; topK: number; maxFilesPerGroup: number;
    excludePairs: ReadonlyArray<readonly [string, string]>;
  }): TemporalCouplingEdge[] | ConfidenceCouplingEdge[] {
    const { db, fromIso, toIso, directional, minChangeCount, jaccardThreshold,
      confidenceThreshold, directionalDiffThreshold, topK, maxFilesPerGroup, excludePairs } = p;
    // filterBy='session' で TC subagentType の既存挙動（s.start_time でのウィンドウ判定）を維持。
    const activityRows = this.fetchSubagentActivityRows({
      from: fromIso, to: toIso, toolNames: SESSION_COUPLING_EDIT_TOOLS, filterBy: 'session',
    });
    const rawValues: ReadonlyArray<readonly [string, string]> = activityRows.map(
      (r) => [r.subagentType, r.filePath] as const,
    );

    const projectRootCandidates = Array.from(
      new Set(
        this.listCurrentGraphs()
          .map((g) => g.graph?.metadata?.projectRoot)
          .filter((p): p is string => typeof p === 'string' && p.length > 0),
      ),
    ).sort((a, b) => a.length - b.length);
    const normalize = this.buildFilePathNormalizer(projectRootCandidates);

    const subagentRows: SubagentTypeFileRow[] = [];
    let normalizationDropped = 0;
    for (const r of rawValues) {
      const subagentType = asText(r[0] ?? '');
      const rawPath = asText(r[1] ?? '');
      const normalized = normalize(rawPath);
      if (subagentType && normalized) {
        subagentRows.push({ subagentType, filePath: normalized });
      } else if (subagentType && rawPath && !normalized) {
        normalizationDropped++;
      }
    }

    this.logSubagentTypeCouplingDiagnostics(db, subagentRows, rawValues.length, normalizationDropped, maxFilesPerGroup, directional);

    if (directional) {
      return computeSubagentTypeConfidenceCoupling(subagentRows, {
        minChangeCount, confidenceThreshold, directionalDiffThreshold, topK,
        maxFilesPerCommit: maxFilesPerGroup, excludePairs, pathFilter: defaultTemporalCouplingPathFilter,
      });
    }
    return computeSubagentTypeCoupling(subagentRows, {
      minChangeCount, jaccardThreshold, topK,
      maxFilesPerCommit: maxFilesPerGroup, excludePairs, pathFilter: defaultTemporalCouplingPathFilter,
    });
  }

  private logSubagentTypeCouplingDiagnostics(
    db: Database,
    subagentRows: SubagentTypeFileRow[],
    rawCount: number,
    normalizationDropped: number,
    maxFilesPerGroup: number,
    directional: boolean,
  ): void {
    if (subagentRows.length === 0) {
      const totalMessages = (db.exec(
        'SELECT COUNT(*) FROM messages WHERE subagent_type IS NOT NULL',
      )[0]?.values[0]?.[0] ?? 0) as number;
      this.logger.warn(
        `[fetchTemporalCoupling/subagentType] 0 rows. ` +
        `messages.subagent_type populated=${totalMessages}, ` +
        `mtc_join_rows=${rawCount}, normalizationDropped=${normalizationDropped}`,
      );
      return;
    }
    // edges=0 が「グループのファイル数が多すぎてスキップ」由来かを確認できるよう、粒度別の生データ件数を残す。
    const filesPerType = new Map<string, Set<string>>();
    for (const r of subagentRows) {
      let s = filesPerType.get(r.subagentType);
      if (!s) { s = new Set(); filesPerType.set(r.subagentType, s); }
      s.add(r.filePath);
    }
    const summary = Array.from(filesPerType.entries())
      .map(([t, s]) => `${t}=${s.size}${s.size > maxFilesPerGroup ? '(SKIPPED:>maxFilesPerGroup)' : ''}`)
      .join(', ');
    this.logger.info(
      `[fetchTemporalCoupling/subagentType] rows=${subagentRows.length}, ` +
      `maxFilesPerGroup=${maxFilesPerGroup}, normalizationDropped=${normalizationDropped}, ` +
      `groups: ${summary}`,
    );
    if (directional && filesPerType.size < 2) {
      this.logger.warn(
        `[fetchTemporalCoupling/subagentType] directional=true だが subagent_type が ${filesPerType.size} 種類しか存在しないため、` +
        `すべてのペアが undirected になり矢印は描画されません。` +
        `期間（windowDays）を伸ばすか、複数の subagent_type を含むデータの取り込みを確認してください。`,
      );
    }
  }

  fetchDefectRisk(options: FetchDefectRiskOptions & { repo?: string }): DefectRiskEntry[] {
    const db = this.ensureDb();
    const { windowDays, halfLifeDays, repo } = options;
    const now = new Date();
    const toIso = now.toISOString();
    const fromIso = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // Phase H-4: sessions.repo_name 列は撤去済。repo フィルタは s.repo_id = ? (repoIdForName 解決) で行う。
    const sql = repo
      ? `SELECT sc.commit_hash, sc.commit_message, sc.committed_at, cf.file_path
         FROM session_commits sc
         JOIN commit_files cf ON cf.commit_hash = sc.commit_hash
         INNER JOIN sessions s ON s.id = sc.session_id
         WHERE sc.committed_at >= ? AND sc.committed_at <= ?
           AND s.repo_id = ?
         ORDER BY sc.committed_at`
      : `SELECT sc.commit_hash, sc.commit_message, sc.committed_at, cf.file_path
         FROM session_commits sc
         JOIN commit_files cf ON cf.commit_hash = sc.commit_hash
         WHERE sc.committed_at >= ? AND sc.committed_at <= ?
         ORDER BY sc.committed_at`;
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const args: (string | number)[] = repo ? [fromIso, toIso, this.repoIdForNameReadonly(repo)] : [fromIso, toIso];
    const result = db.exec(sql, args);

    const values = result[0]?.values ?? [];
    const rows: CommitRiskRow[] = values.map((r) => ({
      commitHash: asText(r[0] ?? ''),
      commitMessage: asText(r[1] ?? ''),
      committedAt: asText(r[2] ?? ''),
      filePath: asText(r[3] ?? ''),
    })).filter((r) => r.filePath && r.commitHash);

    return computeDefectRisk(rows, { halfLifeDays });
  }

  /**
   * current_graphs.graph_json の import エッジから、ファイル間の静的依存ペアを抽出する。
   * 同一ファイル内のシンボル参照は除外する。
   */
  private buildStaticDependencyPairs(repoName: string): ReadonlyArray<readonly [string, string]> {
    const graph = this.getCurrentGraph(repoName);
    if (!graph) return [];
    const idToFile = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.filePath) idToFile.set(node.id, node.filePath);
    }
    const seen = new Set<string>();
    const pairs: Array<readonly [string, string]> = [];
    for (const edge of graph.edges) {
      const src = idToFile.get(edge.source);
      const tgt = idToFile.get(edge.target);
      if (!src || !tgt || src === tgt) continue;
      const key = src < tgt ? `${src} ${tgt}` : `${tgt} ${src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([src, tgt]);
    }
    return pairs;
  }

  /** current_graphs の commit_id を取得する内部ヘルパ */
  private getCurrentGraphCommit(repoName: string): { commitId: string } | null {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const result = db.exec(
      'SELECT commit_id FROM current_graphs WHERE repo_id = ?',
      [this.repoIdForNameReadonly(repoName)],
    );
    const commitId = result[0]?.values?.[0]?.[0];
    if (typeof commitId !== 'string') return null;
    return { commitId };
  }

  /**
   * current_graphs と release_graphs に存在する ID の一覧を返す。
   * current 行は一律 'current' として返し、複数リポジトリがある場合は重複する。
   * current を先頭に、残りは released_at の降順。
   */
  getTrailGraphIds(): string[] {
    const db = this.ensureDb();
    const result = db.exec(`
      SELECT id FROM (
        SELECT 'current' AS id, 0 AS sort_order, '' AS released_at
          FROM current_graphs
        UNION ALL
        SELECT r.tag AS id, 1 AS sort_order, COALESCE(r.released_at, '') AS released_at
          FROM release_graphs rg
          JOIN releases r ON rg.release_id = r.release_id
      )
      ORDER BY sort_order, released_at DESC
    `);
    return (result[0]?.values?.map((r) => r[0] as string) ?? []);
  }

  /**
   * current_graphs と release_graphs の { tag, repoName } ペア一覧を返す。
   * current 行は tag='current'、repoName=<repo_name> として全リポジトリ分を返す。
   * current を先頭に、残りは released_at の降順。
   */
  getTrailGraphEntries(): Array<{ tag: string; repoName: string | null }> {
    const db = this.ensureDb();
    // Phase H-3: repo_name は current_graphs に無い。repos を JOIN して射影する (結果キーは不変)。
    // Phase H-5: releases.repo_name も撤去済。release 行も releases.repo_id → repos を LEFT JOIN して
    // 射影する (repo_id 未解決/sentinel は '' = 旧 repo_name='' と等価・結果キーは不変)。
    const result = db.exec(`
      SELECT tag, repo_name FROM (
        SELECT 'current' AS tag, repo.repo_name AS repo_name, 0 AS sort_order, '' AS released_at
          FROM current_graphs g
          JOIN repos repo ON repo.repo_id = g.repo_id
        UNION ALL
        SELECT r.tag AS tag, COALESCE(relrepo.repo_name, '') AS repo_name, 1 AS sort_order, COALESCE(r.released_at, '') AS released_at
          FROM release_graphs rg
          JOIN releases r ON rg.release_id = r.release_id
          LEFT JOIN repos relrepo ON relrepo.repo_id = r.repo_id
      )
      ORDER BY sort_order, released_at DESC
    `);
    return (result[0]?.values?.map((row) => ({
      tag: row[0] as string,
      repoName: (row[1] as string | null) ?? null,
    })) ?? []);
  }

  // -------------------------------------------------------------------------
  //  Queries
  // -------------------------------------------------------------------------

  getSessions(filters?: SessionFilters): SessionRow[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.branch) {
      conditions.push('s.id IN (SELECT DISTINCT session_id FROM messages WHERE git_branch = ?)');
      params.push(filters.branch);
    }
    if (filters?.model) {
      conditions.push('s.model = ?');
      params.push(filters.model);
    }
    if (filters?.repository) {
      // Phase H-4: sessions.repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
      // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
      conditions.push('s.repo_id = ?');
      params.push(this.repoIdForNameReadonly(filters.repository));
    }
    if (filters?.from) {
      conditions.push('s.start_time >= ?');
      params.push(filters.from);
    }
    if (filters?.to) {
      conditions.push('s.start_time <= ?');
      params.push(filters.to);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';
    // Phase H-4: sessions.repo_name 列は撤去済。SyncService が Supabase trail_sessions へ運ぶ repo_name を
    // 含む契約を維持するため repos を LEFT JOIN して COALESCE(r.repo_name, '') を repo_name として射影する
    // (repo_id 未解決/sentinel は '' = 旧 repo_name='' と等価)。getAsObject が repo_name を含む (契約不変)。
    const sql = `SELECT s.*,
      COALESCE(r.repo_name, '') AS repo_name,
      COALESCE(SUM(sc.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(sc.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(sc.cache_read_tokens), 0) AS cache_read_tokens,
      COALESCE(SUM(sc.cache_creation_tokens), 0) AS cache_creation_tokens,
      COALESCE(SUM(sc.estimated_cost_usd), 0) AS estimated_cost_usd
      FROM sessions s
      LEFT JOIN repos r ON r.repo_id = s.repo_id
      LEFT JOIN session_costs sc ON s.id = sc.session_id
      ${where}
      GROUP BY s.id
      ORDER BY s.start_time DESC`;

    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const rows: SessionRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionRow);
    }
    stmt.free();
    return rows;
  }

  getSessionBranches(sessionIds: readonly string[]): Map<string, string> {
    const result = new Map<string, string>();
    if (sessionIds.length === 0) return result;
    const db = this.ensureDb();
    const placeholders = sessionIds.map(() => '?').join(',');
    const rows = db.exec(
      `SELECT session_id, git_branch FROM messages
       WHERE session_id IN (${placeholders}) AND git_branch IS NOT NULL AND git_branch != ''
       GROUP BY session_id
       ORDER BY MIN(rowid)`,
      sessionIds,
    );
    for (const row of rows[0]?.values ?? []) {
      result.set(String(row[0]), String(row[1]));
    }
    return result;
  }

  getSessionContextStats(sessionIds: readonly string[]): Map<string, { peak: number; initial: number }> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, { peak: number; initial: number }>();

    const placeholders = sessionIds.map(() => '?').join(',');

    try {
      // Peak context per session
      const peakResult = db.exec(
        `SELECT session_id,
          MAX(COALESCE(input_tokens,0) + COALESCE(cache_read_tokens,0) + COALESCE(cache_creation_tokens,0)) AS peak
        FROM messages WHERE session_id IN (${placeholders})
        GROUP BY session_id`,
        sessionIds,
      );
      for (const row of peakResult[0]?.values ?? []) {
        result.set(String(row[0]), { peak: Number(row[1]), initial: 0 });
      }

      // Initial context (first assistant message's cache_creation_tokens per session)
      const initResult = db.exec(
        `SELECT session_id, COALESCE(cache_creation_tokens, 0)
        FROM messages WHERE session_id IN (${placeholders}) AND type = 'assistant'
        GROUP BY session_id
        HAVING timestamp = MIN(timestamp)`,
        sessionIds,
      );
      for (const row of initResult[0]?.values ?? []) {
        const id = String(row[0]);
        const entry = result.get(id);
        if (entry) {
          entry.initial = Number(row[1]);
        } else {
          result.set(id, { peak: 0, initial: Number(row[1]) });
        }
      }
    } catch {
      // Graceful fallback if queries fail
    }

    return result;
  }

  /** Build last-message and last-assistant maps from ordered query rows (rows ordered by session_id, timestamp DESC). */
  private buildSessionLastMsgMaps(rows: readonly unknown[][]): {
    lastMsg: Map<string, { type: string; stopReason: string | null; ctx: number }>;
    lastAssistant: Map<string, { stopReason: string | null; ctx: number }>;
  } {
    const lastMsg = new Map<string, { type: string; stopReason: string | null; ctx: number }>();
    const lastAssistant = new Map<string, { stopReason: string | null; ctx: number }>();
    for (const row of rows) {
      const sid = String(row[0]);
      const type = String(row[1]);
      const stopReason = row[2] === null ? null : asText(row[2]);
      const ctx = Number(row[3]);
      if (!lastMsg.has(sid)) lastMsg.set(sid, { type, stopReason, ctx });
      if (type === 'assistant' && !lastAssistant.has(sid)) lastAssistant.set(sid, { stopReason, ctx });
    }
    return { lastMsg, lastAssistant };
  }

  getSessionInterruptions(
    sessionIds: readonly string[],
  ): Map<string, { interrupted: boolean; reason: 'max_tokens' | 'no_response' | null; contextTokens: number }> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, { interrupted: boolean; reason: 'max_tokens' | 'no_response' | null; contextTokens: number }>();
    const placeholders = sessionIds.map(() => '?').join(',');

    try {
      const lastMsgResult = db.exec(
        `SELECT session_id, type, stop_reason,
          COALESCE(input_tokens,0) + COALESCE(cache_read_tokens,0) + COALESCE(cache_creation_tokens,0) AS ctx
        FROM messages
        WHERE session_id IN (${placeholders}) AND is_meta = 0
        AND type IN ('user','assistant')
        ORDER BY session_id, timestamp DESC`,
        sessionIds,
      );

      const { lastMsg: sessionLastMsg, lastAssistant: sessionLastAssistant } =
        this.buildSessionLastMsgMaps(lastMsgResult[0]?.values ?? []);

      for (const sid of sessionIds) {
        const lastMsg = sessionLastMsg.get(sid);
        const lastAsst = sessionLastAssistant.get(sid);
        if (!lastMsg) continue;
        if (lastAsst?.stopReason === 'max_tokens') {
          result.set(sid, { interrupted: true, reason: 'max_tokens', contextTokens: lastAsst.ctx });
        } else if (lastMsg.type === 'user') {
          result.set(sid, { interrupted: true, reason: 'no_response', contextTokens: lastAsst?.ctx ?? 0 });
        }
      }
    } catch {
      // Graceful fallback
    }

    return result;
  }

  getSessionCommitStats(
    sessionIds: readonly string[],
  ): Map<string, { commits: number; linesAdded: number; linesDeleted: number; filesChanged: number }> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, {
      commits: number; linesAdded: number; linesDeleted: number; filesChanged: number;
    }>();
    const placeholders = sessionIds.map(() => '?').join(',');

    try {
      const rows = db.exec(
        `SELECT session_id,
          COUNT(*) AS commits,
          COALESCE(SUM(lines_added), 0) AS lines_added,
          COALESCE(SUM(lines_deleted), 0) AS lines_deleted,
          COALESCE(SUM(files_changed), 0) AS files_changed
        FROM session_commits
        WHERE session_id IN (${placeholders})
        GROUP BY session_id`,
        sessionIds,
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), {
          commits: Number(row[1]),
          linesAdded: Number(row[2]),
          linesDeleted: Number(row[3]),
          filesChanged: Number(row[4]),
        });
      }
    } catch {
      // Graceful fallback
    }

    return result;
  }

  getSessionErrorCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, COUNT(*) AS error_count
         FROM message_tool_calls
         WHERE is_error = 1 AND session_id IN (${placeholders})
         GROUP BY session_id`,
        sessionIds,
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), Number(row[1]));
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  getSessionSubAgentCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, COUNT(*) AS sub_agent_count
         FROM message_tool_calls
         WHERE tool_name = 'Agent' AND session_id IN (${placeholders})
         GROUP BY session_id`,
        sessionIds,
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), Number(row[1]));
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  getSessionDistinctAgentIdCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, COUNT(DISTINCT agent_id) AS agent_count
         FROM messages
         WHERE session_id IN (${placeholders})
           AND agent_id IS NOT NULL
           AND agent_id != ''
         GROUP BY session_id`,
        sessionIds,
      );
      for (const row of rows[0]?.values ?? []) {
        result.set(String(row[0]), Number(row[1]));
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  /** Parse one tool_calls JSON row and add the delegated subagent track to the set. */
  private parseDelegatedTrackFromRow(
    sid: string,
    toolCallsJson: string,
    tracksBySession: Map<string, Set<string>>,
  ): void {
    let calls: Array<{ name?: string; input?: Record<string, unknown> }> = [];
    try {
      calls = JSON.parse(toolCallsJson) as Array<{ name?: string; input?: Record<string, unknown> }>;
    } catch {
      return;
    }
    const agentCall = calls.find((c) => c.name === 'Agent');
    if (!agentCall) return;
    const subagentType = typeof agentCall.input?.subagent_type === 'string'
      ? agentCall.input.subagent_type : 'unknown';
    const existing = tracksBySession.get(sid) ?? new Set<string>();
    existing.add(`delegated:${subagentType}`);
    tracksBySession.set(sid, existing);
  }

  getSessionDelegatedTrackCounts(sessionIds: readonly string[]): Map<string, number> {
    if (sessionIds.length === 0) return new Map();
    const db = this.ensureDb();
    const result = new Map<string, number>();
    const placeholders = sessionIds.map(() => '?').join(',');
    try {
      const rows = db.exec(
        `SELECT session_id, tool_calls
         FROM messages
         WHERE session_id IN (${placeholders})
           AND type = 'assistant'
           AND (agent_id IS NULL OR agent_id = '')
           AND tool_calls IS NOT NULL`,
        sessionIds,
      );
      const tracksBySession = new Map<string, Set<string>>();
      for (const row of rows[0]?.values ?? []) {
        const sid = asText(row[0] ?? '');
        const toolCallsJson = typeof row[1] === 'string' ? row[1] : '';
        if (!sid || !toolCallsJson) continue;
        this.parseDelegatedTrackFromRow(sid, toolCallsJson, tracksBySession);
      }
      for (const [sid, set] of tracksBySession.entries()) {
        result.set(sid, set.size);
      }
    } catch {
      // Graceful fallback
    }
    return result;
  }

  getSessionCommits(sessionId: string): SessionCommitRow[] {
    const db = this.ensureDb();
    // Phase H-4: session_commits.repo_name 列は撤去済。SyncService が Supabase trail_session_commits へ
    // 運ぶ repo_name を含む契約を維持するため repos を LEFT JOIN して COALESCE(r.repo_name, '') を
    // repo_name として射影する (repo_id=0 sentinel など未解決は '' = 旧 repo_name='' と等価)。
    // getAsObject が repo_name を含む (SessionCommitRow 契約不変)。
    const stmt = db.prepare(
      `SELECT sc.session_id, sc.commit_hash, sc.commit_message, sc.author, sc.committed_at,
              sc.is_ai_assisted, sc.files_changed, sc.lines_added, sc.lines_deleted, sc.repo_id,
              COALESCE(r.repo_name, '') AS repo_name
       FROM session_commits sc
       LEFT JOIN repos r ON r.repo_id = sc.repo_id
       WHERE sc.session_id = ? ORDER BY sc.committed_at ASC`,
    );
    stmt.bind([sessionId]);
    const rows: SessionCommitRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionCommitRow);
    }
    stmt.free();
    return rows;
  }

  insertMessageCommit(input: MessageCommitInput): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO message_commits
        (message_uuid, session_id, commit_hash, detected_at, match_confidence)
        VALUES (?, ?, ?, ?, ?)`,
    );
    try {
      stmt.run([input.messageUuid, input.sessionId, input.commitHash, input.detectedAt, input.matchConfidence]);
    } finally {
      stmt.free();
    }
  }

  // ---------------------------------------------------------------------------
  //  Phase 5 S1: Emergency Protocol (safe_points / emergency_log)
  // ---------------------------------------------------------------------------

  /** セーフポイント保持上限。超過分は record 時に古い順で削除する（肥大化防止）。 */
  private static readonly SAFE_POINT_RETENTION = 500;

  /** 副作用: safe_points へ INSERT（+ 保持上限超過分の DELETE）。永続化は呼び出し側の save() 契約に従う。 */
  recordSafePoint(input: SafePointInput): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT INTO safe_points (created_at, commit_hash, branch, worktree, label, source, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      stmt.run([
        input.createdAt,
        input.commitHash,
        input.branch,
        input.worktree,
        input.label,
        input.source,
        input.sessionId,
      ]);
    } finally {
      stmt.free();
    }
    db.run(
      `DELETE FROM safe_points WHERE id NOT IN (
         SELECT id FROM safe_points ORDER BY created_at DESC, id DESC LIMIT ${TrailDatabase.SAFE_POINT_RETENTION}
       )`,
    );
  }

  /** created_at 降順。 */
  listSafePoints(limit = 100): SafePoint[] {
    const db = this.ensureDb();
    const res = db.exec(
      `SELECT id, created_at, commit_hash, branch, worktree, label, source, session_id
       FROM safe_points ORDER BY created_at DESC, id DESC LIMIT ?`,
      [limit],
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({
      id: row[0] as number,
      createdAt: row[1] as string,
      commitHash: row[2] as string,
      branch: row[3] as string,
      worktree: row[4] as string,
      label: row[5] as string,
      source: row[6] as SafePoint['source'],
      sessionId: (row[7] as string | null) ?? null,
    }));
  }

  /**
   * 副作用: emergency_log へ INSERT。永続化は呼び出し側の save() 契約に従う。
   * 全列一致の既存行があれば挿入しない（内容キーで冪等）。emergency spool の drain は
   * at-least-once（POST 成功をクライアントのタイムアウトが失敗扱いにし再送し得る）のため、
   * 再送をここで吸収する（cross-review 指摘の是正）。
   */
  recordEmergencyEvent(input: EmergencyEventInput): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT INTO emergency_log (occurred_at, event, reason, actor, session_id, detail_json)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM emergency_log
         WHERE occurred_at = ? AND event = ? AND reason = ? AND actor = ?
           AND session_id IS ? AND detail_json IS ?
       )`,
    );
    const values = [
      input.occurredAt,
      input.event,
      input.reason,
      input.actor,
      input.sessionId,
      input.detailJson,
    ];
    try {
      stmt.run([...values, ...values]);
    } finally {
      stmt.free();
    }
  }

  /** occurred_at 降順。 */
  listEmergencyEvents(limit = 100): EmergencyEvent[] {
    const db = this.ensureDb();
    const res = db.exec(
      `SELECT id, occurred_at, event, reason, actor, session_id, detail_json
       FROM emergency_log ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      [limit],
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({
      id: row[0] as number,
      occurredAt: row[1] as string,
      event: row[2] as EmergencyEvent['event'],
      reason: row[3] as string,
      actor: row[4] as EmergencyEvent['actor'],
      sessionId: (row[5] as string | null) ?? null,
      detailJson: row[6] as string,
    }));
  }

  // ---------------------------------------------------------------------------
  //  Phase 6 S1: Flight Review (flight_reviews)
  // ---------------------------------------------------------------------------

  /**
   * 副作用: flight_reviews へ UPSERT。永続化は呼び出し側の save() 契約に従う。
   * session_id キーで冪等。既存行がある場合は機械集計列のみ更新し、
   * outcome / outcome_source / tags / notes / unresolved_items は変更しない
   * （Stop フックの再送・多重発火が S2 の自己評価・S3 の手動訂正を上書きしないため）。
   */
  upsertFlightReviewFromMachine(input: FlightReviewMachineInput): void {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO flight_reviews (
         session_id, workspace_path, started_at, ended_at, duration_seconds,
         tool_call_count, tool_failure_count, rework_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         workspace_path = excluded.workspace_path,
         started_at = excluded.started_at,
         ended_at = excluded.ended_at,
         duration_seconds = excluded.duration_seconds,
         tool_call_count = excluded.tool_call_count,
         tool_failure_count = excluded.tool_failure_count,
         rework_count = excluded.rework_count,
         updated_at = excluded.updated_at`,
    );
    try {
      stmt.run([
        input.sessionId,
        input.workspacePath,
        input.startedAt,
        input.endedAt,
        input.durationSeconds,
        input.toolCallCount,
        input.toolFailureCount,
        input.reworkCount,
        now,
        now,
      ]);
    } finally {
      stmt.free();
    }
  }

  /** ended_at 降順。filter 未指定は直近 100 件。 */
  listFlightReviews(filter: FlightReviewFilter = {}): FlightReview[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filter.sessionId !== undefined) {
      conditions.push('session_id = ?');
      params.push(filter.sessionId);
    }
    if (filter.since !== undefined) {
      conditions.push('ended_at >= ?');
      params.push(filter.since);
    }
    if (filter.until !== undefined) {
      conditions.push('ended_at <= ?');
      params.push(filter.until);
    }
    if (filter.outcome !== undefined) {
      conditions.push('outcome = ?');
      params.push(filter.outcome);
    }
    if (filter.tag !== undefined) {
      // tags は JSON 文字列配列。json_each で配列要素との等値一致（部分一致させない）
      conditions.push('EXISTS (SELECT 1 FROM json_each(flight_reviews.tags) WHERE json_each.value = ?)');
      params.push(filter.tag);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = db.exec(
      `SELECT id, session_id, workspace_path, started_at, ended_at, duration_seconds,
              outcome, outcome_source, tool_call_count, tool_failure_count, rework_count,
              unresolved_items, next_concerns, lesson_candidates, tags, notes, rationale_audit_status,
              created_at, updated_at
       FROM flight_reviews ${where} ORDER BY ended_at DESC, id DESC LIMIT ?`,
      params,
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({
      id: row[0] as number,
      sessionId: row[1] as string,
      workspacePath: row[2] as string,
      startedAt: (row[3] as string | null) ?? null,
      endedAt: row[4] as string,
      durationSeconds: (row[5] as number | null) ?? null,
      outcome: row[6] as FlightReview['outcome'],
      outcomeSource: row[7] as FlightReview['outcomeSource'],
      toolCallCount: row[8] as number,
      toolFailureCount: row[9] as number,
      reworkCount: row[10] as number,
      unresolvedItems: row[11] as string,
      nextConcerns: row[12] as string,
      lessonCandidates: row[13] as string,
      tags: row[14] as string,
      notes: row[15] as string,
      rationaleAuditStatus: row[16] as FlightReview['rationaleAuditStatus'],
      createdAt: row[17] as string,
      updatedAt: row[18] as string,
    }));
  }

  /**
   * 副作用: flight_reviews の outcome 系列を自己評価で更新。永続化は呼び出し側の save() 契約に従う。
   * 優先順位 manual > self > machine を SQL 条件で強制する
   * （outcome_source='manual' の行は WHERE で除外され、人間の訂正を self が上書きしない）。
   */
  applySelfAssessmentToFlightReview(sessionId: string, assessment: SelfAssessment): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `UPDATE flight_reviews
       SET outcome = ?, outcome_source = 'self', unresolved_items = ?, next_concerns = ?, updated_at = ?
       WHERE session_id = ? AND outcome_source != 'manual'`,
    );
    try {
      stmt.run([
        assessment.outcome,
        JSON.stringify(assessment.unresolvedItems),
        JSON.stringify(assessment.nextConcerns),
        new Date().toISOString(),
        sessionId,
      ]);
    } finally {
      stmt.free();
    }
  }

  /**
   * 副作用: flight_reviews を手動訂正で部分更新。永続化は呼び出し側の save() 契約に従う。
   * 更新時は outcome_source='manual' を設定し、以後は applySelfAssessmentToFlightReview の
   * WHERE 条件（outcome_source != 'manual'）と機械 UPSERT の列限定により上書きされない。
   * 対象行が存在しなければ false（行の新規作成はしない）。空 patch は書き込まず存在有無のみ返す。
   */
  updateFlightReviewManual(sessionId: string, patch: FlightReviewManualPatch): boolean {
    const db = this.ensureDb();
    const exists = db.exec(`SELECT 1 FROM flight_reviews WHERE session_id = ? LIMIT 1`, [sessionId]);
    if (exists[0]?.values[0] === undefined) return false;

    const sets: string[] = [];
    const params: string[] = [];
    if (patch.outcome !== undefined) {
      sets.push('outcome = ?');
      params.push(patch.outcome);
    }
    if (patch.tags !== undefined) {
      sets.push('tags = ?');
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes);
    }
    if (sets.length === 0) return true;

    sets.push(`outcome_source = 'manual'`, 'updated_at = ?');
    params.push(new Date().toISOString(), sessionId);
    const stmt = db.prepare(
      `UPDATE flight_reviews SET ${sets.join(', ')} WHERE session_id = ?`,
    );
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
    return true;
  }

  /**
   * 副作用: flight_reviews.rationale_audit_status を更新。永続化は呼び出し側の save() 契約に従う。
   * outcome_source には触れない（監査は成否訂正と独立。相乗りすると self 反映が以後ブロックされる）。
   * 対象行が無ければ false（行の新規作成はしない）。
   */
  markRationaleAudit(sessionId: string, status: RationaleAuditStatus): boolean {
    const db = this.ensureDb();
    const exists = db.exec(`SELECT 1 FROM flight_reviews WHERE session_id = ? LIMIT 1`, [sessionId]);
    if (exists[0]?.values[0] === undefined) return false;
    const stmt = db.prepare(
      `UPDATE flight_reviews SET rationale_audit_status = ?, updated_at = ? WHERE session_id = ?`,
    );
    try {
      stmt.run([status, new Date().toISOString(), sessionId]);
    } finally {
      stmt.free();
    }
    return true;
  }

  /** 副作用: flight_reviews.lesson_candidates を更新。永続化は呼び出し側の save() 契約に従う。 */
  saveFlightReviewLessonCandidates(sessionId: string, candidates: LessonCandidate[]): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `UPDATE flight_reviews SET lesson_candidates = ?, updated_at = ? WHERE session_id = ?`,
    );
    try {
      stmt.run([JSON.stringify(candidates), new Date().toISOString(), sessionId]);
    } finally {
      stmt.free();
    }
  }

  /**
   * 副作用: user_feedback_entries へ INSERT。永続化は呼び出し側の save() 契約に従う。
   * 全列一致の既存行があれば挿入しない（内容キーで冪等。UserPromptSubmit フックの再送を吸収）。
   */
  recordUserFeedbackEntry(input: UserFeedbackInput): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT INTO user_feedback_entries (session_id, occurred_at, prompt_excerpt, matched_pattern, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM user_feedback_entries
         WHERE session_id = ? AND occurred_at = ? AND prompt_excerpt = ? AND matched_pattern = ?
       )`,
    );
    const values = [input.sessionId, input.occurredAt, input.promptExcerpt, input.matchedPattern];
    try {
      stmt.run([...values, new Date().toISOString(), ...values]);
    } finally {
      stmt.free();
    }
  }

  /** occurred_at 降順。filter 未指定は直近 100 件。 */
  listUserFeedbackEntries(filter: UserFeedbackFilter = {}): UserFeedbackEntry[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filter.sessionId !== undefined) {
      conditions.push('session_id = ?');
      params.push(filter.sessionId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = db.exec(
      `SELECT id, session_id, occurred_at, prompt_excerpt, matched_pattern, created_at
       FROM user_feedback_entries ${where} ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      params,
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({
      id: row[0] as number,
      sessionId: row[1] as string,
      occurredAt: row[2] as string,
      promptExcerpt: row[3] as string,
      matchedPattern: row[4] as string,
      createdAt: row[5] as string,
    }));
  }

  markMessageCommitsResolved(sessionId: string, resolvedAt: string): void {
    const db = this.ensureDb();
    const stmt = db.prepare('UPDATE sessions SET message_commits_resolved_at = ? WHERE id = ?');
    try {
      stmt.run([resolvedAt, sessionId]);
    } finally {
      stmt.free();
    }
  }

  isMessageCommitsResolved(sessionId: string): boolean {
    const db = this.ensureDb();
    const result = db.exec('SELECT message_commits_resolved_at FROM sessions WHERE id = ?', [sessionId]);
    const val = result[0]?.values[0]?.[0];
    return typeof val === 'string' && val.length > 0;
  }

  getMessageCommitsBySession(sessionId: string): readonly TrailMessageCommit[] {
    const db = this.ensureDb();
    const stmt = db.prepare(
      'SELECT * FROM message_commits WHERE session_id = ? ORDER BY detected_at ASC',
    );
    stmt.bind([sessionId]);
    const rows: TrailMessageCommit[] = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      rows.push({
        messageUuid: r['message_uuid'] as string,
        sessionId: r['session_id'] as string,
        commitHash: r['commit_hash'] as string,
        detectedAt: r['detected_at'] as string,
        matchConfidence: r['match_confidence'] as TrailMessageCommit['matchConfidence'],
      });
    }
    stmt.free();
    return rows;
  }

  getUnresolvedMessageCommitSessions(): readonly { sessionId: string; filePath: string }[] {
    const db = this.ensureDb();
    const result = db.exec(`
      SELECT DISTINCT s.id, s.file_path
      FROM sessions s
      INNER JOIN session_commits sc ON sc.session_id = s.id
      WHERE s.message_commits_resolved_at IS NULL
    `);
    return (result[0]?.values ?? []).map((row) => ({
      sessionId: row[0] as string,
      filePath: row[1] as string,
    }));
  }

  /** Return the set of message UUIDs that executed a git commit Bash command in the session. */
  getGitCommitMessageUuids(sessionId: string): Set<string> {
    const db = this.ensureDb();
    const result = db.exec(
      "SELECT DISTINCT message_uuid FROM message_tool_calls WHERE session_id = ? AND tool_name = 'Bash' AND command LIKE '%git commit%'",
      [sessionId],
    );
    const uuids = new Set<string>();
    if (result[0]) {
      for (const row of result[0].values) {
        if (typeof row[0] === 'string') uuids.add(row[0]);
      }
    }
    return uuids;
  }

  /** Return the set of message UUIDs that had at least one is_error=1 tool call in the session. */
  getErrorMessageUuids(sessionId: string): Set<string> {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT DISTINCT message_uuid FROM message_tool_calls WHERE session_id = ? AND is_error = 1',
      [sessionId],
    );
    const uuids = new Set<string>();
    if (result[0]) {
      for (const row of result[0].values) {
        if (typeof row[0] === 'string') uuids.add(row[0]);
      }
    }
    return uuids;
  }

  /** Populate skill map from message_tool_calls.skill_name rows (primary path). */
  private fillSkillMapFromTcRows(rows: readonly unknown[][], map: Map<string, string>): void {
    for (const row of rows) {
      const uuid = row[0];
      const skill = row[1];
      if (typeof uuid === 'string' && typeof skill === 'string') map.set(uuid, skill);
    }
  }

  /** Populate skill map from messages.tool_calls JSON (fallback path, skips already-set uuids). */
  private fillSkillMapFromMsgRows(rows: readonly unknown[][], map: Map<string, string>): void {
    for (const row of rows) {
      const uuid = row[0];
      const toolCallsJson = row[1];
      if (typeof uuid !== 'string' || typeof toolCallsJson !== 'string' || map.has(uuid)) continue;
      const skill = extractSkillName(toolCallsJson);
      if (skill) map.set(uuid, skill);
    }
  }

  getSkillsBySession(sessionId: string): Map<string, string> {
    const db = this.ensureDb();
    const map = new Map<string, string>();

    const tcResult = db.exec(
      'SELECT message_uuid, skill_name FROM message_tool_calls WHERE session_id = ? AND skill_name IS NOT NULL GROUP BY message_uuid',
      [sessionId],
    );
    if (tcResult[0]) this.fillSkillMapFromTcRows(tcResult[0].values, map);

    const msgResult = db.exec(
      "SELECT uuid, tool_calls FROM messages WHERE session_id = ? AND type = 'assistant' AND tool_calls IS NOT NULL",
      [sessionId],
    );
    if (msgResult[0]) this.fillSkillMapFromMsgRows(msgResult[0].values, map);

    return map;
  }

  /** Fallback: compute turn exec ms from message timestamps (for sessions without message_tool_calls data). */
  private fillTurnExecMsFromMessages(rows: readonly unknown[][], map: Map<string, number>): void {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const uuid = row[0];
      const type = row[1];
      const timestamp = row[2];
      const toolCalls = row[3];
      if (typeof uuid !== 'string' || map.has(uuid)) continue;
      if (type !== 'assistant' || typeof timestamp !== 'string' || typeof toolCalls !== 'string') continue;
      const startMs = new Date(timestamp).getTime();
      if (!Number.isFinite(startMs)) continue;
      this.findNextUserTurnMs(rows, i + 1, startMs, uuid, map);
    }
  }

  /** Find the next user message after index `from` and set elapsed ms in map if valid. */
  private findNextUserTurnMs(
    rows: readonly unknown[][], from: number, startMs: number, uuid: string, map: Map<string, number>,
  ): void {
    for (let j = from; j < rows.length; j++) {
      const next = rows[j];
      if (next[1] !== 'user' || typeof next[2] !== 'string' || typeof next[4] !== 'string') continue;
      const endMs = new Date(next[2]).getTime();
      if (Number.isFinite(endMs) && endMs > startMs) map.set(uuid, endMs - startMs);
      break;
    }
  }

  getTurnExecMsBySession(sessionId: string): Map<string, number> {
    const db = this.ensureDb();
    const result = db.exec(
      'SELECT message_uuid, turn_exec_ms FROM message_tool_calls WHERE session_id = ? GROUP BY message_uuid',
      [sessionId],
    );
    const map = new Map<string, number>();
    if (result[0]) {
      for (const row of result[0].values) {
        const uuid = row[0];
        const ms = row[1];
        if (typeof uuid === 'string' && typeof ms === 'number' && ms > 0) map.set(uuid, ms);
      }
    }
    const fallback = db.exec(
      `SELECT uuid, type, timestamp, tool_calls, tool_use_result
       FROM messages
       WHERE session_id = ?
       ORDER BY timestamp ASC, uuid ASC`,
      [sessionId],
    );
    this.fillTurnExecMsFromMessages(fallback[0]?.values ?? [], map);
    return map;
  }

  getMessages(sessionId: string, opts?: { since?: string }): MessageRow[] {
    const db = this.ensureDb();
    // since が指定された場合は timestamp フィルタを SQL 側に押し込む。同期処理が
    // 全メッセージを取得してから JS で 7 日カットオフする無駄な I/O を避ける。
    const stmt = opts?.since
      ? db.prepare(
          'SELECT * FROM messages WHERE session_id = ? AND timestamp >= ? ORDER BY timestamp ASC',
        )
      : db.prepare(
          'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
        );
    stmt.bind(opts?.since ? [sessionId, opts.since] : [sessionId]);

    const rows: MessageRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as MessageRow);
    }
    stmt.free();
    return rows;
  }

  /**
   * 委任 (CC sidechain or codex) を CC 親 assistant UUID から委任先 codex session ID へ解決する。
   * 1セッション分の解決を行うラッパー。バッチ実行は `fetchLinkedCodexSessionMapForCcSessions` を使う。
   */
  getLinkedCodexSessionByAssistantUuid(sessionId: string): Map<string, string> {
    return this.fetchLinkedCodexSessionMapForCcSessions([sessionId]).get(sessionId) ?? new Map();
  }

  getLinkedCodexSessionCount(sessionId: string): number {
    return new Set(this.getLinkedCodexSessionByAssistantUuid(sessionId).values()).size;
  }

  /**
   * 期間 [from, to] 内の Claude Code セッションから委任された codex セッション ID 集合。
   */
  fetchLinkedCodexSessionIdsInRange(from: string, to: string): Set<string> {
    const out = new Set<string>();
    try {
      const db = this.ensureDb();
      const ccRes = db.exec(
        `SELECT id FROM sessions
         WHERE source = 'claude_code'
           AND start_time >= ? AND start_time <= ?`,
        [from, to],
      );
      const ccIds = (ccRes[0]?.values ?? [])
        .map((r) => asText(r[0] ?? ''))
        .filter((s) => s.length > 0);
      const linkMap = this.fetchLinkedCodexSessionMapForCcSessions(ccIds);
      for (const m of linkMap.values()) {
        for (const codexId of m.values()) out.add(codexId);
      }
    } catch (e) {
      this.logger.warn(
        `fetchLinkedCodexSessionIdsInRange failed (returning empty set): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return out;
  }

  /**
   * 複数 CC セッションについて `(parent_assistant_uuid → codex_session_id)` Map をバッチ解決する。
   * クエリ数は CC セッション数によらず最大 3。N+1 を避けるための共通実装。
   */
  /** Query codex sessions grouped by repo_name. Filters by repoFilter if non-empty. */
  private fetchCodexSessionsByRepo(
    db: Database,
    repoFilter: string[],
  ): Map<string, Array<{ id: string; repoName: string; startMs: number; endMs: number }>> {
    // Phase H-4: sessions.repo_name 列は撤去済。repos を LEFT JOIN して repo_name を射影し、
    // repo フィルタも r.repo_name IN (...) で行う (旧 repo_name フィルタと意味等価・出力 repoName 不変)。
    const codexRes = repoFilter.length > 0
      ? db.exec(
          `SELECT s.id, COALESCE(r.repo_name, '') AS repo_name, s.start_time, s.end_time
           FROM sessions s
           LEFT JOIN repos r ON r.repo_id = s.repo_id
           WHERE s.source = 'codex' AND COALESCE(r.repo_name, '') IN (${repoFilter.map(() => '?').join(',')})
           ORDER BY s.start_time ASC`,
          repoFilter,
        )
      : db.exec(
          `SELECT s.id, COALESCE(r.repo_name, '') AS repo_name, s.start_time, s.end_time
           FROM sessions s
           LEFT JOIN repos r ON r.repo_id = s.repo_id
           WHERE s.source = 'codex' ORDER BY s.start_time ASC`,
        );
    const byRepo = new Map<string, Array<{ id: string; repoName: string; startMs: number; endMs: number }>>();
    for (const r of codexRes[0]?.values ?? []) {
      const id = asText(r[0] ?? '');
      const repo = asText(r[1] ?? '');
      const startMs = Date.parse(asText(r[2] ?? ''));
      const endMs = Date.parse(asText(r[3] ?? ''));
      if (!id || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      const list = byRepo.get(repo) ?? [];
      list.push({ id, repoName: repo, startMs, endMs });
      byRepo.set(repo, list);
    }
    return byRepo;
  }

  fetchLinkedCodexSessionMapForCcSessions(
    ccSessionIds: readonly string[],
  ): Map<string, Map<string, string>> {
    const out = new Map<string, Map<string, string>>();
    if (ccSessionIds.length === 0) return out;
    const db = this.ensureDb();
    const idPlaceholders = ccSessionIds.map(() => '?').join(',');

    type Delegation = { ccSessionId: string; parentUuid: string; ms: number };

    // Phase H-4: sessions.repo_name 列は撤去済。repos を LEFT JOIN して repo_name を射影する
    // (repo_id 未解決/sentinel は '' = 旧 repo_name='' と等価)。
    const ccRepoRes = db.exec(
      `SELECT s.id, COALESCE(r.repo_name, '') AS repo_name
       FROM sessions s LEFT JOIN repos r ON r.repo_id = s.repo_id
       WHERE s.id IN (${idPlaceholders})`,
      ccSessionIds,
    );
    const repoByCcId = new Map<string, string>();
    for (const r of ccRepoRes[0]?.values ?? []) {
      repoByCcId.set(asText(r[0] ?? ''), asText(r[1] ?? ''));
    }

    const delegRes = db.exec(
      `SELECT session_id, source_tool_assistant_uuid, MIN(timestamp)
       FROM messages
       WHERE session_id IN (${idPlaceholders})
         AND source_tool_assistant_uuid IS NOT NULL
         AND source_tool_assistant_uuid != ''
       GROUP BY session_id, source_tool_assistant_uuid`,
      ccSessionIds,
    );
    const delegationsByCc = new Map<string, Delegation[]>();
    const repoNamesNeeded = new Set<string>();
    for (const r of delegRes[0]?.values ?? []) {
      const ccId = asText(r[0] ?? '');
      const parent = asText(r[1] ?? '');
      const ms = Date.parse(asText(r[2] ?? ''));
      if (!ccId || !parent || !Number.isFinite(ms)) continue;
      const list = delegationsByCc.get(ccId) ?? [];
      list.push({ ccSessionId: ccId, parentUuid: parent, ms });
      delegationsByCc.set(ccId, list);
      repoNamesNeeded.add(repoByCcId.get(ccId) ?? '');
    }
    if (delegationsByCc.size === 0) return out;

    const repoFilter = Array.from(repoNamesNeeded).filter((r) => r.length > 0);
    const codexByRepo = this.fetchCodexSessionsByRepo(db, repoFilter);

    for (const [ccId, delegations] of delegationsByCc) {
      const repo = repoByCcId.get(ccId) ?? '';
      const candidates = codexByRepo.get(repo) ?? [];
      if (candidates.length === 0) continue;
      const m = this.buildDelegationMatchMap(delegations, candidates);
      if (m.size > 0) out.set(ccId, m);
    }
    return out;
  }

  private buildDelegationMatchMap(
    delegations: Array<{ parentUuid: string; ms: number }>,
    candidates: Parameters<typeof matchCodexSessionByTime>[1],
  ): Map<string, string> {
    const m = new Map<string, string>();
    for (const d of delegations) {
      const matched = matchCodexSessionByTime(d.ms, candidates);
      if (matched) m.set(d.parentUuid, matched);
    }
    return m;
  }

  /** fetchSubagentActivityRows 経路 A: CC ネイティブ subagent の行を rows に追記する。 */
  private fetchSubagentPathA(
    db: Database,
    from: string, to: string,
    qctx: { repoArg: (string | number)[]; toolNames: readonly string[]; toolPlaceholders: string; rangeJoin: string; rangeWhere: string; repoFilter: string },
    rows: Array<{ committedAt: string; filePath: string; subagentType: string; sessionId: string; messageUuid: string }>,
  ): void {
    const { repoArg, toolNames, toolPlaceholders, rangeJoin, rangeWhere, repoFilter } = qctx;
    try {
      const resA = db.exec(
        `SELECT m.timestamp, mtc.file_path, m.subagent_type, m.session_id, m.uuid
         FROM message_tool_calls mtc
         INNER JOIN messages m ON m.uuid = mtc.message_uuid
         ${rangeJoin}
         WHERE ${rangeWhere}
           ${repoFilter}
           AND mtc.tool_name IN (${toolPlaceholders})
           AND mtc.file_path IS NOT NULL
           AND mtc.file_path != ''
           AND m.subagent_type IS NOT NULL`,
        [from, to, ...repoArg, ...toolNames],
      );
      for (const row of resA[0]?.values ?? []) {
        const subagentType = asText(row[2] ?? '');
        if (!subagentType) continue;
        rows.push({
          committedAt: asText(row[0] ?? ''),
          filePath: asText(row[1] ?? ''),
          subagentType,
          sessionId: asText(row[3] ?? ''),
          messageUuid: asText(row[4] ?? ''),
        });
      }
    } catch (e) {
      this.logger.warn(
        `fetchSubagentActivityRows path A (cc subagent) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** fetchSubagentActivityRows 経路 B: codex 委任セッションの行を rows に追記する。 */
  private fetchSubagentPathB(
    db: Database,
    from: string, to: string,
    qctx: { repoArg: (string | number)[]; toolNames: readonly string[]; toolPlaceholders: string; rangeJoin: string; rangeWhere: string; repoFilter: string },
    codexSessionIds: Set<string>,
    rows: Array<{ committedAt: string; filePath: string; subagentType: string; sessionId: string; messageUuid: string }>,
  ): void {
    const { repoArg, toolNames, toolPlaceholders, rangeJoin, rangeWhere, repoFilter } = qctx;
    try {
      const idList = Array.from(codexSessionIds);
      const idPlaceholders = idList.map(() => '?').join(',');
      const resB = db.exec(
        `SELECT m.timestamp, mtc.file_path, m.session_id, m.uuid
         FROM message_tool_calls mtc
         INNER JOIN messages m ON m.uuid = mtc.message_uuid
         ${rangeJoin}
         WHERE ${rangeWhere}
           ${repoFilter}
           AND mtc.tool_name IN (${toolPlaceholders})
           AND mtc.file_path IS NOT NULL
           AND mtc.file_path != ''
           AND m.session_id IN (${idPlaceholders})`,
        [from, to, ...repoArg, ...toolNames, ...idList],
      );
      for (const row of resB[0]?.values ?? []) {
        rows.push({
          committedAt: asText(row[0] ?? ''),
          filePath: asText(row[1] ?? ''),
          subagentType: CODEX_SUBAGENT_TYPE,
          sessionId: asText(row[2] ?? ''),
          messageUuid: asText(row[3] ?? ''),
        });
      }
    } catch (e) {
      this.logger.warn(
        `fetchSubagentActivityRows path B (codex linked) failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * subagent 粒度の集計で使用する活動行を返す共通関数。
   * - 経路 A (CC ネイティブ subagent): `messages.subagent_type IS NOT NULL` の編集行
   * - 経路 B (codex 委任): `sessions.source='codex'` かつ範囲内 CC から委任された session の編集行
   *   → `subagentType` ラベルとして `'codex'` を合成
   *
   * `filterBy`:
   *   - `'message'` (default): `m.timestamp` で範囲フィルタ。Heatmap/Trend/Hotspot 用
   *   - `'session'`: `s.start_time` で範囲フィルタ。TC subagentType 既存挙動互換
   *
   * 戻り値は `committedAt` (= messages.timestamp) でソート済み。
   */
  fetchSubagentActivityRows(params: {
    from: string;
    to: string;
    toolNames: readonly string[];
    filterBy?: 'message' | 'session';
    repo?: string;
  }): ReadonlyArray<{
    readonly committedAt: string;
    readonly filePath: string;
    readonly subagentType: string;
    readonly sessionId: string;
    readonly messageUuid: string;
  }> {
    const db = this.ensureDb();
    const { from, to, toolNames, filterBy = 'message', repo } = params;
    if (toolNames.length === 0) return [];

    const toolPlaceholders = toolNames.map(() => '?').join(',');
    const rows: Array<{
      committedAt: string;
      filePath: string;
      subagentType: string;
      sessionId: string;
      messageUuid: string;
    }> = [];

    // session JOIN は filterBy='session' または repo 指定時に必要
    const needsSessionJoin = filterBy === 'session' || !!repo;
    const rangeJoin = needsSessionJoin
      ? 'INNER JOIN sessions s ON s.id = m.session_id'
      : '';
    const rangeWhere = filterBy === 'session'
      ? 's.start_time >= ? AND s.start_time <= ?'
      : 'm.timestamp >= ? AND m.timestamp <= ?';
    // Phase H-4: sessions.repo_name 列は撤去済。repo フィルタは s.repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const repoFilter = repo ? 'AND s.repo_id = ?' : '';
    const repoArg: (string | number)[] = repo ? [this.repoIdForNameReadonly(repo)] : [];

    const qctx = { repoArg, toolNames, toolPlaceholders, rangeJoin, rangeWhere, repoFilter };
    // 経路 A: CC ネイティブ subagent
    this.fetchSubagentPathA(db, from, to, qctx, rows);

    // 経路 B: codex 委任セッション（同一 repo + 時刻近傍でリンク済）
    const codexSessionIds = this.fetchLinkedCodexSessionIdsInRange(from, to);
    if (codexSessionIds.size > 0) {
      this.fetchSubagentPathB(db, from, to, qctx, codexSessionIds, rows);
    }

    rows.sort((a, b) => {
      if (a.committedAt < b.committedAt) return -1;
      return a.committedAt > b.committedAt ? 1 : 0;
    });
    return rows;
  }

  searchMessages(query: string): SearchResult[] {
    const db = this.ensureDb();
    const pattern = `%${query}%`;
    const sql = `SELECT session_id, uuid, type, timestamp,
      COALESCE(
        SUBSTR(text_content, MAX(1, INSTR(LOWER(text_content), LOWER(?)) - 30), 80),
        SUBSTR(user_content, MAX(1, INSTR(LOWER(user_content), LOWER(?)) - 30), 80),
        ''
      ) AS snippet
      FROM messages
      WHERE text_content LIKE ? OR user_content LIKE ? OR tool_calls LIKE ?
      ORDER BY timestamp DESC
      LIMIT 100`;

    const stmt = db.prepare(sql);
    stmt.bind([query, query, pattern, pattern, pattern]);

    const results: SearchResult[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as SearchResult);
    }
    stmt.free();
    return results;
  }

  getLastImportedAt(): string | null {
    this.ensureDb();
    const result = this.db!.exec(
      `SELECT MAX(imported_at) as last_imported FROM sessions`,
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const value = result[0].values[0][0];
    return value ? asText(value) : null;
  }

  getStats(): DbStats {
    const db = this.ensureDb();

    // Totals
    const totals = db.exec(
      `SELECT COUNT(*) as cnt,
        COALESCE(SUM(input_tokens), 0) as ti,
        COALESCE(SUM(output_tokens), 0) as to2
      FROM sessions`,
    );
    const totalRow = totals[0]?.values[0] ?? [0, 0, 0];

    // Top tool names from messages
    const toolsSql = `SELECT jt.value AS name, COUNT(*) AS cnt
      FROM messages, json_each(
        (SELECT group_concat(json_extract(je.value, '$.name'))
         FROM json_each(tool_calls) AS je)
      ) AS jt
      WHERE tool_calls IS NOT NULL
      GROUP BY jt.value
      ORDER BY cnt DESC
      LIMIT 10`;

    let topToolNames: { name: string; count: number }[] = [];
    try {
      const toolResult = db.exec(toolsSql);
      if (toolResult[0]) {
        topToolNames = toolResult[0].values.map((r) => ({
          name: String(r[0]),
          count: Number(r[1]),
        }));
      }
    } catch {
      // FTS or json functions may not be available
    }

    // Sessions per branch
    const branchResult = db.exec(
      `SELECT git_branch, COUNT(*) as cnt FROM sessions
       WHERE git_branch != '' GROUP BY git_branch ORDER BY cnt DESC`,
    );
    const sessionsByBranch = (branchResult[0]?.values ?? []).map((r) => ({
      branch: String(r[0]),
      count: Number(r[1]),
    }));

    // Sessions per model
    const modelResult = db.exec(
      `SELECT model, COUNT(*) as cnt FROM sessions
       WHERE model != '' GROUP BY model ORDER BY cnt DESC`,
    );
    const sessionsByModel = (modelResult[0]?.values ?? []).map((r) => ({
      model: String(r[0]),
      count: Number(r[1]),
    }));

    return {
      totalSessions: Number(totalRow[0]),
      totalInputTokens: Number(totalRow[1]),
      totalOutputTokens: Number(totalRow[2]),
      topToolNames,
      sessionsByBranch,
      sessionsByModel,
    };
  }

  /**
   * Compute tool-call-based metrics (Retry Rate, Build/Test Fail Rate).
   * If sessionId is provided, scopes to that session only.
   */
  private analyzeSessionToolCallRows(
    rows: unknown[][],
  ): {
    totalEdits: number; totalRetries: number;
    totalBuildRuns: number; totalBuildFails: number;
    totalTestRuns: number; totalTestFails: number;
  } {
    const BUILD_RE = /\b(npm run build|npx tsc|tsc\b|webpack|vite build|esbuild|rollup)\b/;
    const TEST_RE = /\b(jest|vitest|npm run test|npm test|npx jest)\b/;
    const FAIL_RE = /ERR!|exit code [1-9]|non-zero exit|Command failed/i;
    let totalEdits = 0; let totalRetries = 0;
    let totalBuildRuns = 0; let totalBuildFails = 0;
    let totalTestRuns = 0; let totalTestFails = 0;
    const editsBySession = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const sessId = String(row[0]);
      const toolCallsJson = String(row[1]);
      const toolResultStr = row[2] == null ? null : asText(row[2]);
      let calls: { name: string; input: Record<string, unknown> }[];
      try {
        calls = JSON.parse(toolCallsJson);
      } catch { continue; }
      if (!Array.isArray(calls)) continue;

      for (const call of calls) {
        if (call.name === 'Edit' || call.name === 'Write') {
          totalEdits++;
          const filePath = typeof call.input?.file_path === 'string' ? call.input.file_path : '';
          if (filePath) {
            let fileMap = editsBySession.get(sessId);
            if (!fileMap) { fileMap = new Map(); editsBySession.set(sessId, fileMap); }
            fileMap.set(filePath, (fileMap.get(filePath) ?? 0) + 1);
          }
        }
        if (call.name === 'Bash') {
          const cmd = typeof call.input?.command === 'string' ? call.input.command : '';
          const isFailed = toolResultStr != null && FAIL_RE.test(toolResultStr);
          if (BUILD_RE.test(cmd)) { totalBuildRuns++; if (isFailed) totalBuildFails++; }
          if (TEST_RE.test(cmd)) { totalTestRuns++; if (isFailed) totalTestFails++; }
        }
      }
    }
    for (const fileMap of editsBySession.values()) {
      for (const count of fileMap.values()) {
        if (count > 1) totalRetries += count - 1;
      }
    }
    return { totalEdits, totalRetries, totalBuildRuns, totalBuildFails, totalTestRuns, totalTestFails };
  }

  private fetchSessionModelUsage(db: Database, sessionId: string): { model: string; count: number; tokens: number; durationMs: number }[] | undefined {
    const mdResult = db.exec(
      `SELECT model,
              COUNT(*) AS count,
              CAST(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS INTEGER) AS tokens
       FROM messages
       WHERE session_id = ? AND type = 'assistant' AND model IS NOT NULL
       GROUP BY model ORDER BY count DESC`,
      [sessionId],
    );
    const durResult = db.exec(
      `WITH turn_dur AS (
         SELECT DISTINCT session_id, turn_index, model, turn_exec_ms
         FROM message_tool_calls
         WHERE session_id = ? AND model IS NOT NULL
       )
       SELECT model, CAST(SUM(COALESCE(turn_exec_ms, 0)) AS INTEGER) AS duration_ms
       FROM turn_dur GROUP BY model`,
      [sessionId],
    );
    const durMap = new Map<string, number>();
    if (durResult[0]) {
      const cols = durResult[0].columns;
      for (const row of durResult[0].values) {
        const r = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
        durMap.set(asText(r['model'] ?? ''), Number(r['duration_ms'] ?? 0));
      }
    }
    if (!mdResult[0]) return undefined;
    const cols = mdResult[0].columns;
    return mdResult[0].values.map(row => {
      const r = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      const model = asText(r['model'] ?? '');
      return { model, count: Number(r['count'] ?? 0), tokens: Number(r['tokens'] ?? 0), durationMs: durMap.get(model) ?? 0 };
    });
  }

  private fetchSessionErrorsByTool(db: Database, sessionId: string): { tool: string; count: number }[] | undefined {
    const erResult = db.exec(
      String.raw`SELECT CASE
                WHEN tool_name LIKE 'mcp\_\_%\_\_%' ESCAPE '\'
                THEN SUBSTR(tool_name, 1, INSTR(SUBSTR(tool_name, 6), '__') + 4)
                ELSE tool_name
              END AS tool,
              COUNT(*) AS count
       FROM message_tool_calls
       WHERE session_id = ? AND is_error = 1
       GROUP BY tool
       ORDER BY count DESC`,
      [sessionId],
    );
    if (!erResult[0]) return undefined;
    const cols = erResult[0].columns;
    return erResult[0].values.map(row => {
      const r = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      return { tool: asText(r['tool'] ?? ''), count: Number(r['count'] ?? 0) };
    });
  }

  computeToolMetrics(sessionId?: string): {
    totalRetries: number;
    totalEdits: number;
    totalBuildRuns: number;
    totalBuildFails: number;
    totalTestRuns: number;
    totalTestFails: number;
    toolUsage?: readonly { tool: string; count: number; tokens: number; durationMs: number }[];
    skillUsage?: readonly { skill: string; count: number; tokens: number; durationMs: number }[];
    errorsByTool?: { tool: string; count: number }[];
    modelUsage?: { model: string; count: number; tokens: number; durationMs: number }[];
  } {
    const zero = {
      totalRetries: 0, totalEdits: 0,
      totalBuildRuns: 0, totalBuildFails: 0,
      totalTestRuns: 0, totalTestFails: 0,
    };
    try {
      const db = this.ensureDb();

      // Global metrics: use pre-computed message_tool_calls instead of parsing message JSON
      if (!sessionId) {
        const editRes = db.exec(
          `SELECT COUNT(*) FROM message_tool_calls WHERE tool_name IN ('Edit', 'Write')`,
        );
        const totalEdits = Number(editRes[0]?.values[0]?.[0] ?? 0);

        const retryRes = db.exec(
          `SELECT COALESCE(SUM(edit_count - 1), 0)
           FROM (
             SELECT COUNT(*) AS edit_count
             FROM message_tool_calls
             WHERE tool_name IN ('Edit', 'Write') AND file_path IS NOT NULL AND file_path != ''
             GROUP BY session_id, file_path
             HAVING COUNT(*) > 1
           )`,
        );
        const totalRetries = Number(retryRes[0]?.values[0]?.[0] ?? 0);

        const buildRes = db.exec(
          `SELECT COUNT(*), COALESCE(SUM(is_error), 0)
           FROM message_tool_calls
           WHERE tool_name = 'Bash' AND (
             command LIKE '%npm run build%' OR command LIKE '%npx tsc%' OR
             command LIKE '% tsc %' OR command LIKE '% tsc' OR command LIKE 'tsc %' OR
             command LIKE '%webpack%' OR command LIKE '%vite build%' OR
             command LIKE '%esbuild%' OR command LIKE '%rollup%'
           )`,
        );
        const totalBuildRuns = Number(buildRes[0]?.values[0]?.[0] ?? 0);
        const totalBuildFails = Number(buildRes[0]?.values[0]?.[1] ?? 0);

        const testRes = db.exec(
          `SELECT COUNT(*), COALESCE(SUM(is_error), 0)
           FROM message_tool_calls
           WHERE tool_name = 'Bash' AND (
             command LIKE '%jest%' OR command LIKE '%vitest%' OR
             command LIKE '%npm run test%' OR command LIKE '%npm test%'
           )`,
        );
        const totalTestRuns = Number(testRes[0]?.values[0]?.[0] ?? 0);
        const totalTestFails = Number(testRes[0]?.values[0]?.[1] ?? 0);

        return { totalRetries, totalEdits, totalBuildRuns, totalBuildFails, totalTestRuns, totalTestFails };
      }

      // Session-specific path: fetch messages with tool_calls for per-session detail
      const result = db.exec(
        `SELECT m1.session_id, m1.tool_calls, m2.tool_use_result
         FROM messages m1
         LEFT JOIN messages m2
           ON m2.parent_uuid = m1.uuid AND m2.tool_use_result IS NOT NULL
         WHERE m1.session_id = ? AND m1.tool_calls IS NOT NULL`,
        [sessionId],
      );
      if (!result[0]) return zero;

      const {
        totalEdits, totalRetries,
        totalBuildRuns, totalBuildFails,
        totalTestRuns, totalTestFails,
      } = this.analyzeSessionToolCallRows(result[0].values);

      // セッション指定時のみツール別/スキル別/モデル別/エラー別統計を集計
      const toolUsage = this.aggregateToolUsageBySession(sessionId);
      const skillUsage = this.aggregateSkillUsageBySession(sessionId);
      const modelUsage = this.fetchSessionModelUsage(db, sessionId);
      const errorsByTool = this.fetchSessionErrorsByTool(db, sessionId);

      return {
        totalRetries, totalEdits,
        totalBuildRuns, totalBuildFails,
        totalTestRuns, totalTestFails,
        toolUsage,
        skillUsage,
        errorsByTool,
        modelUsage,
      };
    } catch {
      return zero;
    }
  }

  /**
   * 指定日の tool/skill/error/model 利用統計を daily_counts から集計して返す。
   * Activity タブで日付バーを選択した直後に表示する右側パネル用。
   */
  getDayToolMetrics(date: string): {
    totalRetries: number;
    totalEdits: number;
    totalBuildRuns: number;
    totalBuildFails: number;
    totalTestRuns: number;
    totalTestFails: number;
    toolUsage: { tool: string; count: number; tokens: number; durationMs: number }[];
    skillUsage: { skill: string; count: number; tokens: number; durationMs: number }[];
    errorsByTool: { tool: string; count: number }[];
    modelUsage: { model: string; count: number; tokens: number; durationMs: number }[];
  } | null {
    try {
      const db = this.ensureDb();

      const editRes = db.exec(
        `SELECT COUNT(*) FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.tool_name IN ('Edit', 'Write')`,
        [date],
      );
      const totalEdits = Number(editRes[0]?.values[0]?.[0] ?? 0);

      const retryRes = db.exec(
        `SELECT COALESCE(SUM(edit_count - 1), 0)
         FROM (
           SELECT COUNT(*) AS edit_count
           FROM message_tool_calls mtc
           JOIN sessions s ON s.id = mtc.session_id
           WHERE DATE(s.start_time, '+540 minutes') = ?
             AND mtc.tool_name IN ('Edit', 'Write') AND mtc.file_path IS NOT NULL AND mtc.file_path != ''
           GROUP BY mtc.session_id, mtc.file_path HAVING COUNT(*) > 1
         )`,
        [date],
      );
      const totalRetries = Number(retryRes[0]?.values[0]?.[0] ?? 0);

      const buildRes = db.exec(
        `SELECT COUNT(*), COALESCE(SUM(mtc.is_error), 0)
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.tool_name = 'Bash' AND (
           mtc.command LIKE '%npm run build%' OR mtc.command LIKE '%npx tsc%' OR
           mtc.command LIKE '% tsc %' OR mtc.command LIKE '% tsc' OR mtc.command LIKE 'tsc %' OR
           mtc.command LIKE '%webpack%' OR mtc.command LIKE '%vite build%' OR
           mtc.command LIKE '%esbuild%' OR mtc.command LIKE '%rollup%'
         )`,
        [date],
      );
      const totalBuildRuns = Number(buildRes[0]?.values[0]?.[0] ?? 0);
      const totalBuildFails = Number(buildRes[0]?.values[0]?.[1] ?? 0);

      const testRes = db.exec(
        `SELECT COUNT(*), COALESCE(SUM(mtc.is_error), 0)
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.tool_name = 'Bash' AND (
           mtc.command LIKE '%jest%' OR mtc.command LIKE '%vitest%' OR
           mtc.command LIKE '%npm run test%' OR mtc.command LIKE '%npm test%'
         )`,
        [date],
      );
      const totalTestRuns = Number(testRes[0]?.values[0]?.[0] ?? 0);
      const totalTestFails = Number(testRes[0]?.values[0]?.[1] ?? 0);

      // tool/skill: session start_time 基準（errorsByTool と同スコープ）
      const toolRows = this.aggregateByDayInternal(date, 'tool_name', false);
      const toolMap = new Map<string, { count: number; tokens: number; durationMs: number }>(
        toolRows.map((r) => [r.key, { count: r.count, tokens: r.tokens, durationMs: r.durationMs }]),
      );

      const skillRows = this.aggregateByDayInternal(date, 'skill_name', true);
      const skillMap = new Map<string, { count: number; tokens: number; durationMs: number }>(
        skillRows.map((r) => [r.key, { count: r.count, tokens: r.tokens, durationMs: r.durationMs }]),
      );

      // model: session start_time 基準
      const modelResult = db.exec(
        `SELECT COALESCE(m.model, '') AS model, s.source,
                COUNT(*) AS count,
                CAST(SUM(COALESCE(m.input_tokens, 0) + COALESCE(m.output_tokens, 0)) AS INTEGER) AS tokens
         FROM messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND m.type = 'assistant'
         GROUP BY COALESCE(m.model, ''), s.source`,
        [date],
      );
      const modelMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
      for (const row of modelResult[0]?.values ?? []) {
        const source = asText(row[1] ?? '') as PricingSource;
        const model = resolvePricingModelName(asText(row[0] ?? ''), source);
        const count = Number(row[2] ?? 0);
        const tokens = Number(row[3] ?? 0);
        const e = modelMap.get(model) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += count;
        e.tokens += tokens;
        modelMap.set(model, e);
      }

      // errorsByTool: session start_time 基準で集計（セッション一覧の errorCount と同じスコープ）
      const errResult = db.exec(
        String.raw`SELECT CASE
                  WHEN mtc.tool_name LIKE 'mcp\_\_%\_\_%' ESCAPE '\'
                  THEN SUBSTR(mtc.tool_name, 1, INSTR(SUBSTR(mtc.tool_name, 6), '__') + 4)
                  ELSE mtc.tool_name
                END AS tool,
                COUNT(*) AS count
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE DATE(s.start_time, '+540 minutes') = ? AND mtc.is_error = 1
         GROUP BY tool
         ORDER BY count DESC`,
        [date],
      );
      const errMap = new Map<string, number>();
      for (const row of errResult[0]?.values ?? []) {
        const tool = asText(row[0] ?? '');
        const count = Number(row[1] ?? 0);
        errMap.set(tool, (errMap.get(tool) ?? 0) + count);
      }

      return {
        totalRetries, totalEdits, totalBuildRuns, totalBuildFails,
        totalTestRuns, totalTestFails,
        toolUsage: [...toolMap.entries()].map(([tool, e]) => ({ tool, ...e })).sort((a, b) => b.count - a.count),
        skillUsage: [...skillMap.entries()].map(([skill, e]) => ({ skill, ...e })).sort((a, b) => b.count - a.count),
        errorsByTool: [...errMap.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
        modelUsage: [...modelMap.entries()].map(([model, e]) => ({ model, ...e })).sort((a, b) => b.count - a.count),
      };
    } catch (e) {
      this.logger.error(`getDayToolMetrics failed for date=${date}`, e);
      return null;
    }
  }

  getAnalytics(): AnalyticsData {
    const db = this.ensureDb();

    // Token totals from messages with source-aware missing-rate compensation
    const tzOffset = this.getLocalTzOffset();
    const tokensBySourceResult = db.exec(
      `SELECT s.source,
        SUM(COALESCE(m.input_tokens,0)) AS raw_input,
        SUM(COALESCE(m.output_tokens,0)) AS raw_output,
        SUM(COALESCE(m.cache_read_tokens,0)) AS raw_cache_read,
        SUM(COALESCE(m.cache_creation_tokens,0)) AS raw_cache_creation,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
       GROUP BY s.source`,
    );
    const factorBySource = new Map<string, number>();
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;
    for (const row of tokensBySourceResult[0]?.values ?? []) {
      const source = asText(row[0] ?? '');
      const rawInput = Number(row[1]);
      const rawOutput = Number(row[2]);
      const rawCacheRead = Number(row[3]);
      const rawCacheCreation = Number(row[4]);
      const totalTurns = Number(row[5]);
      const missingTurns = Number(row[6]);
      const observed = totalTurns - missingTurns;
      const factor = observed > 0 ? totalTurns / observed : 1;
      factorBySource.set(source, factor);
      totalInput += Math.round(rawInput * factor);
      totalOutput += Math.round(rawOutput * factor);
      totalCacheRead += Math.round(rawCacheRead * factor);
      totalCacheCreation += Math.round(rawCacheCreation * factor);
    }
    // Estimated cost from session_costs with source factor
    const costBySourceResult = db.exec(
      `SELECT s.source, COALESCE(SUM(sc.estimated_cost_usd), 0)
       FROM session_costs sc
       JOIN sessions s ON s.id = sc.session_id
       GROUP BY s.source`,
    );
    let totalEstimatedCost = 0;
    for (const row of costBySourceResult[0]?.values ?? []) {
      const source = asText(row[0] ?? '');
      const rawCost = Number(row[1]);
      const factor = factorBySource.get(source) ?? 1;
      totalEstimatedCost += rawCost * factor;
    }
    const totalSessions = Number(db.exec(`SELECT COUNT(*) FROM sessions`)[0]?.values[0]?.[0] ?? 0);

    // Tool usage TOP 15
    const toolsSql = `SELECT jt.value AS name, COUNT(*) AS cnt
      FROM messages, json_each(
        (SELECT group_concat(json_extract(je.value, '$.name'))
         FROM json_each(tool_calls) AS je)
      ) AS jt
      WHERE tool_calls IS NOT NULL
      GROUP BY jt.value
      ORDER BY cnt DESC
      LIMIT 15`;

    let toolUsage: { name: string; count: number }[] = [];
    try {
      const toolResult = db.exec(toolsSql);
      if (toolResult[0]) {
        toolUsage = toolResult[0].values.map((r) => ({
          name: String(r[0]),
          count: Number(r[1]),
        }));
      }
    } catch {
      // json functions may not be available
    }

    // Daily activity from messages — grouped by session start_time date (same basis as session list)
    const dailyMsgResult = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS date,
        s.source,
        SUM(COALESCE(m.input_tokens,0)) AS raw_input,
        SUM(COALESCE(m.output_tokens,0)) AS raw_output,
        SUM(COALESCE(m.cache_read_tokens,0)) AS raw_cache_read,
        SUM(COALESCE(m.cache_creation_tokens,0)) AS raw_cache_creation,
        COUNT(*) AS total_turns,
        SUM(CASE WHEN COALESCE(m.input_tokens,0)+COALESCE(m.output_tokens,0)
                      +COALESCE(m.cache_read_tokens,0)+COALESCE(m.cache_creation_tokens,0)=0
                 THEN 1 ELSE 0 END) AS missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant'
         AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date, s.source
       ORDER BY date`,
    );
    const dailyCostResult = db.exec(
      `SELECT DATE(s.start_time, '${tzOffset}') AS date,
        s.source, COALESCE(SUM(sc.estimated_cost_usd), 0)
       FROM session_costs sc
       JOIN sessions s ON s.id = sc.session_id
       WHERE DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date, s.source`,
    );
    type DailyEntry = { sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; estimatedCostUsd: number; commits: number; linesAdded: number; linesDeleted: number };
    const dailyMap = new Map<string, DailyEntry>();
    for (const row of dailyMsgResult[0]?.values ?? []) {
      const date = String(row[0]);
      const rawInput = Number(row[2]);
      const rawOutput = Number(row[3]);
      const rawCacheRead = Number(row[4]);
      const rawCacheCreation = Number(row[5]);
      const totalTurns = Number(row[6]);
      const missingTurns = Number(row[7]);
      const observed = totalTurns - missingTurns;
      const factor = observed > 0 ? totalTurns / observed : 1;
      const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
      entry.inputTokens += Math.round(rawInput * factor);
      entry.outputTokens += Math.round(rawOutput * factor);
      entry.cacheReadTokens += Math.round(rawCacheRead * factor);
      entry.cacheCreationTokens += Math.round(rawCacheCreation * factor);
      dailyMap.set(date, entry);
    }
    for (const row of dailyCostResult[0]?.values ?? []) {
      const date = String(row[0]);
      const source = asText(row[1] ?? '');
      const rawCost = Number(row[2]);
      const factor = factorBySource.get(source) ?? 1;
      const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
      entry.estimatedCostUsd += rawCost * factor;
      dailyMap.set(date, entry);
    }

    // Sessions, Commits, LOC daily breakdown
    const dailyStatsResult = db.exec(
      `SELECT date,
              SUM(sessions) AS sessions,
              SUM(commits) AS commits,
              SUM(loc_added) AS loc_added,
              SUM(loc_deleted) AS loc_deleted
       FROM (
         SELECT DATE(start_time, '${tzOffset}') AS date, COUNT(*) AS sessions, 0 AS commits, 0 AS loc_added, 0 AS loc_deleted
         FROM sessions WHERE start_time != '' GROUP BY date
         UNION ALL
         SELECT date, 0 AS sessions, SUM(commit_count) AS commits, SUM(lines_added) AS loc_added, SUM(lines_deleted) AS loc_deleted
         FROM (
           SELECT DATE(s.start_time, '${tzOffset}') AS date,
                  COUNT(*) AS commit_count,
                  SUM(COALESCE(sc.lines_added, 0)) AS lines_added,
                  SUM(COALESCE(sc.lines_deleted, 0)) AS lines_deleted
           FROM session_commits sc
           JOIN sessions s ON sc.session_id = s.id
           WHERE sc.committed_at != '' AND s.start_time != ''
           GROUP BY s.id
         )
         GROUP BY date
       )
       WHERE date >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date`,
    );
    for (const row of dailyStatsResult[0]?.values ?? []) {
      const date = String(row[0]);
      const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
      entry.sessions += Number(row[1]);
      entry.commits += Number(row[2]);
      entry.linesAdded += Number(row[3]);
      entry.linesDeleted += Number(row[4]);
      dailyMap.set(date, entry);
    }

    const dailyActivity = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // Commit totals
    // Phase H-4: session_commits.repo_name 列は撤去済。dedup は repo_id × commit_hash で行う
    // (repo_id は repo_name と 1:1 のため重複排除の結果は等価。repo_name は出力に不要)。
    const commitTotals = db.exec(
      `SELECT COUNT(*) AS total_commits,
        COALESCE(SUM(lines_added), 0) AS total_lines_added,
        COALESCE(SUM(lines_deleted), 0) AS total_lines_deleted
      FROM (
        SELECT repo_id, commit_hash, MAX(COALESCE(lines_added, 0)) AS lines_added, MAX(COALESCE(lines_deleted, 0)) AS lines_deleted
        FROM session_commits GROUP BY repo_id, commit_hash
      )`,
    );
    const cr = commitTotals[0]?.values[0] ?? [0, 0, 0];
    const totalCommits = Number(cr[0]);
    const totalLinesAdded = Number(cr[1]);
    const totalLinesDeleted = Number(cr[2]);

    // AI-assisted commits + files changed
    const aiCommitResult = db.exec(
      `SELECT COALESCE(SUM(CASE WHEN is_ai_assisted = 1 THEN 1 ELSE 0 END), 0),
              COALESCE(SUM(files_changed), 0)
       FROM session_commits`,
    );
    const acr = aiCommitResult[0]?.values[0] ?? [0, 0];
    const totalAiAssistedCommits = Number(acr[0]);
    const totalFilesChanged = Number(acr[1]);

    // Total session duration
    const durationResult = db.exec(
      `SELECT COALESCE(SUM(
        (julianday(end_time) - julianday(start_time)) * 86400000
      ), 0)
       FROM sessions
       WHERE start_time != '' AND end_time != ''`,
    );
    const totalSessionDurationMs = Number(
      durationResult[0]?.values[0]?.[0] ?? 0,
    );

    // Current total LOC from latest release snapshot
    const locResult = db.exec(
      `SELECT COALESCE(total_lines, 0) FROM releases WHERE total_lines > 0 AND released_at IS NOT NULL AND released_at != '' ORDER BY released_at DESC LIMIT 1`,
    );
    const totalLoc = Number(locResult[0]?.values[0]?.[0] ?? 0);

    // Tool-call-based metrics (Retry Rate, Build/Test Fail Rate)
    const toolMetrics = this.computeToolMetrics();

    return {
      totals: {
        sessions: totalSessions,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheCreationTokens: totalCacheCreation,
        estimatedCostUsd: totalEstimatedCost,
        totalCommits,
        totalLinesAdded,
        totalLinesDeleted,
        totalFilesChanged,
        totalAiAssistedCommits,
        totalSessionDurationMs,
        totalLoc,
        ...toolMetrics,
      },
      toolUsage,
      dailyActivity,
    };
  }

  private aggregateModelStats(modelRows: Record<string, unknown>[]): Array<{
    period: string; model: string; count: number; tokens: number;
    tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number;
  }> {
    const modelAggMap = new Map<string, { count: number; tokens: number; totalTurns: number; missingTurns: number }>();
    for (const r of modelRows) {
      const period = asText(r['period'] ?? '');
      const source = asText(r['source'] ?? '') as PricingSource;
      const model = resolvePricingModelName(asText(r['model'] ?? ''), source);
      const count = Number(r['count'] ?? 0);
      const rawTokens = Number(r['tokens'] ?? 0);
      const missingTurns = Number(r['token_missing_turns'] ?? 0);
      const observedTurns = count - missingTurns;
      const factor = observedTurns > 0 ? count / observedTurns : 1;
      const key = `${period}::${model}`;
      const cur = modelAggMap.get(key) ?? { count: 0, tokens: 0, totalTurns: 0, missingTurns: 0 };
      cur.count += count;
      cur.tokens += Math.round(rawTokens * factor);
      cur.totalTurns += count;
      cur.missingTurns += missingTurns;
      modelAggMap.set(key, cur);
    }
    return [...modelAggMap.entries()].map(([k, v]) => {
      const sep = k.indexOf('::');
      return {
        period: k.slice(0, sep),
        model: k.slice(sep + 2),
        count: v.count,
        tokens: v.tokens,
        tokenMissingRate: v.totalTurns > 0 ? v.missingTurns / v.totalTurns : 0,
        tokenTotalTurns: v.totalTurns,
        tokenMissingTurns: v.missingTurns,
      };
    });
  }

  private aggregateAgentStats(
    agentTokenRows: Record<string, unknown>[],
    agentCostRows: Record<string, unknown>[],
    agentLocRows: Record<string, unknown>[],
  ): Array<{
    period: string; agent: string; tokens: number; costUsd: number; loc: number;
    tokenMissingRate: number; tokenTotalTurns: number; tokenMissingTurns: number;
  }> {
    type AgentEntry = { tokens: number; costUsd: number; loc: number; tokenTotalTurns: number; tokenMissingTurns: number };
    const agentMap = new Map<string, AgentEntry>();
    const addMetric = (period: string, agent: string, delta: Partial<AgentEntry>) => {
      const key = `${period}::${agent}`;
      const cur = agentMap.get(key) ?? { tokens: 0, costUsd: 0, loc: 0, tokenTotalTurns: 0, tokenMissingTurns: 0 };
      cur.tokens += delta.tokens ?? 0;
      cur.costUsd += delta.costUsd ?? 0;
      cur.loc += delta.loc ?? 0;
      cur.tokenTotalTurns += delta.tokenTotalTurns ?? 0;
      cur.tokenMissingTurns += delta.tokenMissingTurns ?? 0;
      agentMap.set(key, cur);
    };
    for (const r of agentTokenRows) {
      addMetric(asText(r['period'] ?? ''), asText(r['agent'] ?? ''), {
        tokens: Number(r['tokens'] ?? 0),
        tokenTotalTurns: Number(r['token_total_turns'] ?? 0),
        tokenMissingTurns: Number(r['token_missing_turns'] ?? 0),
      });
    }
    for (const r of agentCostRows) {
      addMetric(asText(r['period'] ?? ''), asText(r['agent'] ?? ''), { costUsd: Number(r['cost_usd'] ?? 0) });
    }
    for (const r of agentLocRows) {
      addMetric(asText(r['period'] ?? ''), asText(r['agent'] ?? ''), { loc: Number(r['loc'] ?? 0) });
    }
    return [...agentMap.entries()].map(([k, v]) => {
      const sep = k.indexOf('::');
      const observedTurns = v.tokenTotalTurns - v.tokenMissingTurns;
      const factor = observedTurns > 0 ? v.tokenTotalTurns / observedTurns : 1;
      return {
        period: k.slice(0, sep),
        agent: k.slice(sep + 2),
        tokens: Math.round(v.tokens * factor),
        costUsd: v.costUsd * factor,
        loc: v.loc,
        tokenMissingRate: v.tokenTotalTurns > 0 ? v.tokenMissingTurns / v.tokenTotalTurns : 0,
        tokenTotalTurns: v.tokenTotalTurns,
        tokenMissingTurns: v.tokenMissingTurns,
      };
    });
  }

  private computeAiFirstTryRate(
    commitRows: Array<{
      period: string; repoName: string; hash: string; subject: string;
      committed_at: string; is_ai_assisted: boolean; linesAdded: number;
      linesDeleted: number; files: string[];
    }>,
    todayPeriod: string,
  ): Array<{ period: string; rate: number; sampleSize: number }> {
    const fixes = commitRows
      .filter(c => isAiFirstTryFailureCommit(c.subject))
      .map(c => ({ ms: Date.parse(c.committed_at), codeFiles: c.files.filter(isCodeFile) }))
      .filter(f => !Number.isNaN(f.ms));
    const rateAgg = new Map<string, { total: number; success: number }>();
    for (const c of commitRows) {
      if (!c.is_ai_assisted) continue;
      if (c.period > todayPeriod) continue;
      const codeFiles = c.files.filter(isCodeFile);
      if (c.files.length > 0 && codeFiles.length === 0) continue;
      const commitMs = Date.parse(c.committed_at);
      if (Number.isNaN(commitMs)) continue;
      const aiSet = new Set(codeFiles);
      const failed = fixes.some(f =>
        f.ms > commitMs &&
        f.ms - commitMs <= AI_FIRST_TRY_FIX_WINDOW_MS &&
        (aiSet.size > 0 && f.codeFiles.some(fp => aiSet.has(fp))),
      );
      const e = rateAgg.get(c.period) ?? { total: 0, success: 0 };
      e.total += 1;
      if (!failed) e.success += 1;
      rateAgg.set(c.period, e);
    }
    return [...rateAgg.entries()]
      .map(([period, { total, success }]) => ({
        period,
        rate: total === 0 ? 0 : (success / total) * 100,
        sampleSize: total,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  getCombinedData(period: 'day' | 'week', rangeDays: 30 | 90): CombinedData {
    const db = this.ensureDb();
    // daily_counts.date は YYYY-MM-DD（タイムゾーン適用済み）。
    // week 集計時は strftime('%Y-W%W', date) で週キー化。
    const periodExpr = period === 'week' ? `strftime('%Y-W%W', date)` : 'date';
    const cutoff = `DATE('now', '-${rangeDays} days')`;
    const tzOffset = this.getLocalTzOffset();
    const sessionStartPeriodExpr = period === 'week'
      ? `strftime('%Y-W%W', s.start_time, '${tzOffset}')`
      : `DATE(s.start_time, '${tzOffset}')`;
    const commitPeriodExpr = period === 'week'
      ? `strftime('%Y-W%W', committed_at, '${tzOffset}')`
      : `DATE(committed_at, '${tzOffset}')`;

    const toRows = (result: ReturnType<typeof db.exec>): Record<string, unknown>[] => {
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
    };

    const toolRawRows = this.aggregateToolUsageByMessageDateCutoff(rangeDays, period, tzOffset);
    // JS 側で (period, tool) 単位に集約し factor を適用する
    type ToolAggEntry = { count: number; durationMs: number; adjustedTokens: number; totalTurns: number; missingTurns: number };
    const toolAggMap = new Map<string, ToolAggEntry>();
    for (const r of toolRawRows) {
      const p = asText(r['period'] ?? '');
      const tool = asText(r['tool'] ?? '');
      const totalTurns = Number(r['token_total_turns'] ?? 0);
      const missingTurns = Number(r['token_missing_turns'] ?? 0);
      const observedTurns = totalTurns - missingTurns;
      const factor = observedTurns > 0 ? totalTurns / observedTurns : 1;
      const rawTokens = Number(r['tokens'] ?? 0);
      const k = `${p}|${tool}`;
      const cur = toolAggMap.get(k) ?? { count: 0, durationMs: 0, adjustedTokens: 0, totalTurns: 0, missingTurns: 0 };
      cur.count += Number(r['count'] ?? 0);
      cur.durationMs += Number(r['duration_ms'] ?? 0);
      cur.adjustedTokens += rawTokens * factor;
      cur.totalTurns += totalTurns;
      cur.missingTurns += missingTurns;
      toolAggMap.set(k, cur);
    }
    const toolCounts = [...toolAggMap.entries()].map(([k, e]) => {
      const sep = k.indexOf('|');
      const period = k.slice(0, sep);
      const tool = k.slice(sep + 1);
      return {
        period,
        tool,
        count: e.count,
        tokens: Math.round(e.adjustedTokens),
        durationMs: e.durationMs,
        tokenMissingRate: e.totalTurns > 0 ? e.missingTurns / e.totalTurns : 0,
        tokenTotalTurns: e.totalTurns,
        tokenMissingTurns: e.missingTurns,
      };
    });

    // エラー集計: session start_time 基準（daily_counts の timestamp 基準と一致させる）
    const errResult = db.exec(
      String.raw`SELECT ${sessionStartPeriodExpr} AS period,
              CASE
                WHEN mtc.tool_name LIKE 'mcp\_\_%\_\_%' ESCAPE '\'
                THEN SUBSTR(mtc.tool_name, 1, INSTR(SUBSTR(mtc.tool_name, 6), '__') + 4)
                ELSE mtc.tool_name
              END AS tool,
              COUNT(*) AS err_count
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.is_error = 1
         AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
       GROUP BY period, tool`,
    );
    const errByPeriod = new Map<string, { byTool: Record<string, number> }>();
    for (const r of toRows(errResult)) {
      const p = asText(r['period'] ?? '');
      const tool = asText(r['tool'] ?? '');
      const errCount = Number(r['err_count'] ?? 0);
      if (errCount === 0) continue;
      const e = errByPeriod.get(p) ?? { byTool: {} };
      e.byTool[tool] = (e.byTool[tool] ?? 0) + errCount;
      errByPeriod.set(p, e);
    }
    const errorRate = [...errByPeriod.entries()].map(([p, v]) => ({
      period: p, rate: 0, byTool: v.byTool,
    }));

    const skillResult = db.exec(
      `SELECT ${periodExpr} AS period, key AS skill, SUM(count) AS count
       FROM daily_counts
       WHERE kind = 'skill' AND date >= ${cutoff}
       GROUP BY period, key`,
    );
    const skillStats = toRows(skillResult).map(r => ({
      period: asText(r['period'] ?? ''),
      skill: asText(r['skill'] ?? ''),
      count: Number(r['count'] ?? 0),
      costUsd: 0,
    }));

    const modelResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              COALESCE(m.model, '') AS model,
              s.source,
              COUNT(*) AS count,
              CAST(SUM(COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0)) AS INTEGER) AS tokens,
              SUM(CASE WHEN COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0)
                              + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0) = 0
                       THEN 1 ELSE 0 END) AS token_missing_turns
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant' AND DATE(s.start_time, '${tzOffset}') >= ${cutoff}
       GROUP BY period, COALESCE(m.model, ''), s.source`,
    );
    const modelStats = this.aggregateModelStats(toRows(modelResult));

    const agentTokenResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              CASE WHEN s.source = 'codex' THEN 'Codex' ELSE 'Claude Code' END AS agent,
              SUM(COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0) + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0)) AS tokens,
              SUM(CASE WHEN m.type = 'assistant' THEN 1 ELSE 0 END) AS token_total_turns,
              SUM(CASE
                    WHEN m.type = 'assistant'
                     AND COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0) + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0) = 0
                    THEN 1 ELSE 0
                  END) AS token_missing_turns
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE DATE(s.start_time, '${tzOffset}') >= ${cutoff}
       GROUP BY period, agent`,
    );
    const agentCostResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              CASE WHEN s.source = 'codex' THEN 'Codex' ELSE 'Claude Code' END AS agent,
              SUM(COALESCE(sc.estimated_cost_usd,0)) AS cost_usd
       FROM session_costs sc
       JOIN sessions s ON s.id = sc.session_id
       WHERE DATE(s.start_time, '${tzOffset}') >= ${cutoff}
       GROUP BY period, agent`,
    );
    const agentLocResult = db.exec(
      `SELECT ${commitPeriodExpr} AS period,
              CASE WHEN s.source = 'codex' THEN 'Codex' ELSE 'Claude Code' END AS agent,
              SUM(COALESCE(c.lines_added,0)) AS loc
       FROM session_commits c
       JOIN sessions s ON s.id = c.session_id
       WHERE DATE(c.committed_at, '${tzOffset}') >= ${cutoff}
       GROUP BY period, agent`,
    );
    const agentStats = this.aggregateAgentStats(
      toRows(agentTokenResult), toRows(agentCostResult), toRows(agentLocResult),
    );

    // Commit stats: session_commits を取得し、AI 1 発成功率のファイル overlap 判定に必要な
    // committed_at / is_ai_assisted / commit_files を一緒に取る。分母の fix 検出のために
    // 期間末尾から 168h 先のコミットも取得する。手動コミットが複数セッションに重複登録される
    // ため repo_name + commit_hash で排除する。
    const commitWindowSec = Math.round(AI_FIRST_TRY_FIX_WINDOW_MS / 1000);
    const sessionDateExpr = period === 'week'
      ? `strftime('%Y-W%W', s.start_time, '${tzOffset}')`
      : `DATE(s.start_time, '${tzOffset}')`;
    // Phase H-4: session_commits.repo_name 列は撤去済。repos を LEFT JOIN して repo_name を射影し
    // (出力 repoName 不変)、dedup は repo_id (1:1 で repo_name) を含めて行う。下の commit_files lookup の
    // `${repoName}:${hash}` キーと整合させるため、両側で repos JOIN による repo_name を使う。
    const commitResult = db.exec(
      `SELECT ${sessionDateExpr} AS period, COALESCE(rp.repo_name, '') AS repo_name, sc.commit_hash,
              MAX(sc.commit_message) AS commit_message,
              MIN(sc.committed_at) AS committed_at,
              MAX(sc.is_ai_assisted) AS is_ai_assisted,
              MAX(COALESCE(sc.lines_added, 0)) AS lines_added,
              MAX(COALESCE(sc.lines_deleted, 0)) AS lines_deleted
       FROM session_commits sc
       JOIN sessions s ON sc.session_id = s.id
       LEFT JOIN repos rp ON rp.repo_id = sc.repo_id
       WHERE sc.committed_at >= DATETIME('now', '-${rangeDays} days')
         AND sc.committed_at <= DATETIME('now', '+${commitWindowSec} seconds')
       GROUP BY sc.session_id, sc.repo_id, sc.commit_hash`,
    );
    type CommitRow = {
      period: string;
      repoName: string;
      hash: string;
      subject: string;
      committed_at: string;
      is_ai_assisted: boolean;
      linesAdded: number;
      linesDeleted: number;
      files: string[];
    };
    const commitRows: CommitRow[] = toRows(commitResult).map(r => ({
      period: asText(r['period'] ?? ''),
      repoName: asText(r['repo_name'] ?? ''),
      hash: asText(r['commit_hash'] ?? ''),
      subject: asText(r['commit_message'] ?? '').split('\n')[0],
      committed_at: asText(r['committed_at'] ?? ''),
      is_ai_assisted: Number(r['is_ai_assisted'] ?? 0) === 1,
      linesAdded: Number(r['lines_added'] ?? 0),
      linesDeleted: Number(r['lines_deleted'] ?? 0),
      files: [],
    }));

    // Batch-fetch commit_files for all commit hashes in the window
    if (commitRows.length > 0) {
      const hashPlaceholders = commitRows.map(() => '?').join(',');
      // Phase H-4: commit_files.repo_name 列は撤去済。repos を LEFT JOIN して repo_name を射影し
      // (上の commitResult と同じ repo_name キーで `${repoName}:${hash}` を引けるようにする)。
      const filesResult = db.exec(
        `SELECT COALESCE(r.repo_name, '') AS repo_name, cf.commit_hash, cf.file_path
         FROM commit_files cf
         LEFT JOIN repos r ON r.repo_id = cf.repo_id
         WHERE cf.commit_hash IN (${hashPlaceholders})`,
        commitRows.map(c => c.hash),
      );
      if (filesResult[0]) {
        const byHash = new Map<string, string[]>();
        for (const row of filesResult[0].values) {
          const h = `${asText(row[0] ?? '')}:${asText(row[1] ?? '')}`;
          const p = asText(row[2] ?? '');
          const list = byHash.get(h);
          if (list) list.push(p);
          else byHash.set(h, [p]);
        }
        for (const c of commitRows) {
          c.files = byHash.get(`${c.repoName}:${c.hash}`) ?? [];
        }
      }
    }

    // Commit prefix stats: 期間内のコミットだけを集計 (period はセッション開始日基準)
    const cutoffDateExpr = sessionDateExpr.replace('s.start_time', "DATE('now')");
    const cutoffPeriodRes = db.exec(`SELECT ${cutoffDateExpr} AS period`);
    const todayPeriod = asText(cutoffPeriodRes[0]?.values?.[0]?.[0] ?? '');
    const commitPrefixStats = aggregateCommitPrefixStats(commitRows, todayPeriod);

    // Per-period regression count: 累積モードの右軸退行率計算に使う。
    const regressionMap = new Map<string, number>();
    for (const c of commitRows) {
      if (c.period > todayPeriod) continue;
      if (!COMMIT_REGRESSION_FIX_RE.test(c.subject)) continue;
      regressionMap.set(c.period, (regressionMap.get(c.period) ?? 0) + 1);
    }
    const commitRegressionByPeriod = [...regressionMap.entries()]
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Commit baseline: 表示期間 cutoff より前の全 commit を category 別に集計 (累積モード用)。
    // commit_hash で DISTINCT し、同一 commit が複数 session に紐づく重複を排除する。
    // Phase H-4: session_commits.repo_name 列は撤去済。dedup は repo_id × commit_hash で行う
    // (repo_id は repo_name と 1:1 のため等価。repo_name は出力に不要)。
    const baselineResult = db.exec(
      `SELECT commit_message, lines_added, lines_deleted FROM (
         SELECT MAX(commit_message) AS commit_message,
                MAX(COALESCE(lines_added, 0)) AS lines_added,
                MAX(COALESCE(lines_deleted, 0)) AS lines_deleted
         FROM session_commits
         WHERE committed_at < DATETIME('now', '-${rangeDays} days')
         GROUP BY repo_id, commit_hash
       )`,
    );
    const baselineRows = toRows(baselineResult).map(r => ({
      subject: asText(r['commit_message'] ?? '').split('\n')[0],
      linesAdded: Number(r['lines_added'] ?? 0),
      linesDeleted: Number(r['lines_deleted'] ?? 0),
    }));
    const commitBaseline = aggregateCommitPrefixBaseline(baselineRows);

    // Repository stats: COUNT は commitRows を再利用（既に repo_name+commit_hash で重複排除済み）
    const repoCountMap = new Map<string, number>();
    for (const c of commitRows) {
      if (c.period > todayPeriod) continue;
      if (!c.repoName) continue;
      const k = `${c.period}::${c.repoName}`;
      repoCountMap.set(k, (repoCountMap.get(k) ?? 0) + 1);
    }

    // Repository stats: TOKEN は messages JOIN sessions で集計（session start_time 基準）
    // Phase H-4: sessions.repo_name 列は撤去済。repos を JOIN して repo_name を射影・グルーピングする。
    // 旧 `s.repo_name != ''` (非空 repo のみ) は repos JOIN + `r.repo_name != ''` で意味等価
    // (sentinel '' repo・repo_id 未解決行を除外する)。
    const repoTokenResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period,
              r.repo_name AS repo_name,
              SUM(COALESCE(m.input_tokens,0) + COALESCE(m.output_tokens,0)
                  + COALESCE(m.cache_read_tokens,0) + COALESCE(m.cache_creation_tokens,0)) AS tokens
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       JOIN repos r ON r.repo_id = s.repo_id
       WHERE m.type = 'assistant'
         AND DATE(s.start_time, '${tzOffset}') >= ${cutoff}
         AND r.repo_name != ''
       GROUP BY period, s.repo_id`,
    );
    const repoTokenMap = new Map<string, number>();
    for (const r of toRows(repoTokenResult)) {
      const period = asText(r['period'] ?? '');
      const repoName = asText(r['repo_name'] ?? '');
      const k = `${period}::${repoName}`;
      repoTokenMap.set(k, Number(r['tokens'] ?? 0));
    }

    // COUNT と TOKEN をマージ
    const repoAllKeys = new Set([...repoCountMap.keys(), ...repoTokenMap.keys()]);
    const repoStats = [...repoAllKeys].map(k => {
      const sep = k.indexOf('::');
      const repoName = k.slice(sep + 2);
      return {
        period: k.slice(0, sep),
        repoName,
        count: repoCountMap.get(k) ?? 0,
        tokens: repoTokenMap.get(k) ?? 0,
      };
    }).filter(r => r.repoName !== '');

    // AI First-Try Success Rate per period
    const aiFirstTryRate = this.computeAiFirstTryRate(commitRows, todayPeriod);

    // Build / Test fail rate per period
    const buildTestResult = db.exec(
      `SELECT period,
              SUM(CASE WHEN cmd_type = 'build' THEN 1 ELSE 0 END) AS build_runs,
              SUM(CASE WHEN cmd_type = 'build' AND is_error = 1 THEN 1 ELSE 0 END) AS build_fails,
              SUM(CASE WHEN cmd_type = 'test' THEN 1 ELSE 0 END) AS test_runs,
              SUM(CASE WHEN cmd_type = 'test' AND is_error = 1 THEN 1 ELSE 0 END) AS test_fails
       FROM (
         SELECT ${sessionStartPeriodExpr} AS period,
                mtc.is_error,
                CASE
                  WHEN mtc.command LIKE '%npm run build%' OR mtc.command LIKE '%npx tsc%'
                    OR mtc.command LIKE '% tsc %' OR mtc.command LIKE '% tsc'
                    OR mtc.command LIKE 'tsc %'
                    OR mtc.command LIKE '%webpack%' OR mtc.command LIKE '%vite build%'
                    OR mtc.command LIKE '%esbuild%' OR mtc.command LIKE '%rollup%'
                    THEN 'build'
                  WHEN mtc.command LIKE '%jest%' OR mtc.command LIKE '%vitest%'
                    OR mtc.command LIKE '%npm run test%' OR mtc.command LIKE '%npm test%'
                    THEN 'test'
                  ELSE NULL
                END AS cmd_type
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE mtc.tool_name = 'Bash'
           AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
       )
       WHERE cmd_type IS NOT NULL
       GROUP BY period`,
    );

    // Retry rate per period: retries = (edit_count - 1) per (session, file) groups with count > 1
    const editCountResult = db.exec(
      `SELECT ${sessionStartPeriodExpr} AS period, COUNT(*) AS total_edits
       FROM message_tool_calls mtc
       JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.tool_name IN ('Edit', 'Write')
         AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
       GROUP BY period`,
    );
    const retryResult = db.exec(
      `SELECT period, SUM(cnt - 1) AS total_retries
       FROM (
         SELECT ${sessionStartPeriodExpr} AS period, COUNT(*) AS cnt
         FROM message_tool_calls mtc
         JOIN sessions s ON s.id = mtc.session_id
         WHERE mtc.tool_name IN ('Edit', 'Write')
           AND mtc.file_path IS NOT NULL AND mtc.file_path != ''
           AND DATE(s.start_time, '${tzOffset}') >= DATE('now', '${tzOffset}', '-${rangeDays} days')
         GROUP BY ${sessionStartPeriodExpr}, mtc.session_id, mtc.file_path
         HAVING COUNT(*) > 1
       )
       GROUP BY period`,
    );

    const qualityRates = aggregateQualityRates(toRows(buildTestResult), toRows(editCountResult), toRows(retryResult));

    return {
      toolCounts,
      errorRate,
      skillStats,
      modelStats,
      agentStats,
      commitPrefixStats,
      aiFirstTryRate,
      repoStats,
      qualityRates,
      commitBaseline,
      commitRegressionByPeriod,
    };
  }

  getCostOptimization(): CostOptimizationData {
    const db = this.ensureDb();
    const tzOffset = this.getLocalTzOffset();

    // 1. Actual cost by model from session_costs
    const actualResult = db.exec(
      `SELECT model, SUM(estimated_cost_usd)
       FROM session_costs GROUP BY model`,
    );
    const actualByModel: Record<string, number> = {};
    let actualTotal = 0;
    for (const row of actualResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = Number(row[1]);
      actualByModel[m] = (actualByModel[m] ?? 0) + c;
      actualTotal += c;
    }

    // 2. Skill-based estimate from daily_counts (kind='cost_skill')
    const skillResult = db.exec(
      `SELECT key AS model, SUM(estimated_cost_usd)
       FROM daily_counts WHERE kind = 'cost_skill'
       GROUP BY key`,
    );
    const skillByModel: Record<string, number> = {};
    let skillTotal = 0;
    for (const row of skillResult[0]?.values ?? []) {
      const m = String(row[0]);
      const c = Number(row[1]);
      skillByModel[m] = (skillByModel[m] ?? 0) + c;
      skillTotal += c;
    }

    // 4. Daily breakdown from daily_counts (last 90 days, kind IN cost_actual/cost_skill)
    const dailyResult = db.exec(
      `SELECT date, SUBSTR(kind, 6) AS cost_type, SUM(estimated_cost_usd)
       FROM daily_counts
       WHERE kind IN ('cost_actual', 'cost_skill')
         AND date >= DATE('now', '${tzOffset}', '-180 days')
       GROUP BY date, kind ORDER BY date`,
    );
    const dailyMap = new Map<string, { actual: number; skill: number }>();
    for (const row of dailyResult[0]?.values ?? []) {
      const d = String(row[0]);
      const ct = String(row[1]);
      const c = Number(row[2]);
      const entry = dailyMap.get(d) ?? { actual: 0, skill: 0 };
      if (ct === 'actual') entry.actual += c;
      else if (ct === 'skill') entry.skill += c;
      dailyMap.set(d, entry);
    }
    const daily: Array<{ date: string; actualCost: number; skillCost: number }> = [];
    for (const [d, entry] of dailyMap) {
      daily.push({
        date: d,
        actualCost: entry.actual,
        skillCost: entry.skill,
      });
    }

    // 5. Model distribution (message count) — from daily_counts to avoid full messages scan
    const distActual = db.exec(
      `SELECT key, SUM(count) FROM daily_counts WHERE kind = 'model' GROUP BY key`,
    );
    const actualDist: Record<string, number> = {};
    for (const row of distActual[0]?.values ?? []) {
      actualDist[String(row[0])] = Number(row[1]);
    }

    const distSkill = db.exec(
      `SELECT key, SUM(count) FROM daily_counts WHERE kind = 'cost_skill' GROUP BY key`,
    );
    const skillDist: Record<string, number> = {};
    for (const row of distSkill[0]?.values ?? []) {
      skillDist[String(row[0])] = Number(row[1]);
    }

    return {
      actual: { totalCost: actualTotal, byModel: actualByModel },
      skillEstimate: { totalCost: skillTotal, byModel: skillByModel },
      daily,
      modelDistribution: {
        actual: actualDist,
        skillRecommended: skillDist,
      },
    };
  }

  /** Insert one package's coverage-summary.json into release_coverage. Returns count of inserted rows. */
  private importReleaseCoverageForPackage(
    db: Database, latestReleaseId: number, pkgDir: string, summaryPath: string,
  ): number {
    let summary: Record<string, CoverageSummaryEntry>;
    try {
      summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as Record<string, CoverageSummaryEntry>;
    } catch {
      return 0;
    }
    let count = 0;
    for (const [key, entry] of Object.entries(summary)) {
      if (!entry?.lines || !entry?.statements || !entry?.functions || !entry?.branches) continue;
      const filePath = key === 'total' ? '__total__' : key;
      try {
        db.run(
          `INSERT OR IGNORE INTO release_coverage (
            release_id, package, file_path,
            lines_total, lines_covered, lines_pct,
            statements_total, statements_covered, statements_pct,
            functions_total, functions_covered, functions_pct,
            branches_total, branches_covered, branches_pct
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            latestReleaseId, pkgDir, filePath,
            entry.lines.total, entry.lines.covered, entry.lines.pct,
            entry.statements.total, entry.statements.covered, entry.statements.pct,
            entry.functions.total, entry.functions.covered, entry.functions.pct,
            entry.branches.total, entry.branches.covered, entry.branches.pct,
          ],
        );
        count++;
      } catch { /* ignore */ }
    }
    return count;
  }

  importCoverage(gitRoot: string): number {
    const db = this.ensureDb();

    // flip 後 release_coverage は release_id FK。最新リリースの release_id を取得する。
    const latestResult = db.exec(
      "SELECT release_id FROM releases ORDER BY released_at DESC LIMIT 1",
    );
    const latestReleaseId = latestResult[0]?.values?.[0]?.[0];
    if (latestReleaseId == null) return 0;

    const packagesDir = path.join(gitRoot, 'packages');
    let packageDirs: string[];
    try {
      packageDirs = fs.readdirSync(packagesDir);
    } catch {
      return 0;
    }

    let count = 0;
    for (const pkgDir of packageDirs) {
      const summaryPath = path.join(packagesDir, pkgDir, 'coverage', 'coverage-summary.json');
      count += this.importReleaseCoverageForPackage(db, Number(latestReleaseId), pkgDir, summaryPath);
    }
    return count;
  }

  importCurrentCoverage(gitRoot: string, repoName: string): number {
    const db = this.ensureDb();
    // Phase C-2 flip: current_coverage は (repo_id, package, file_path) PK。Phase H-3: repo_name 列は撤去済。
    const repoId = this.repoIdForName(repoName);
    // 洗い替え
    db.run('DELETE FROM current_coverage WHERE repo_id = ?', [repoId]);

    const packagesDir = path.join(gitRoot, 'packages');
    let count = 0;
    let pkgDirs: string[];
    try {
      pkgDirs = fs.readdirSync(packagesDir);
    } catch {
      return 0;
    }

    const now = new Date().toISOString();
    for (const pkgDir of pkgDirs) {
      const summaryPath = path.join(packagesDir, pkgDir, 'coverage', 'coverage-summary.json');
      if (!fs.existsSync(summaryPath)) continue;
      let summary: Record<string, unknown>;
      try {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as Record<string, unknown>;
      } catch {
        continue;
      }
      const toPct = (v: number | string | undefined | null): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
      for (const [key, entry] of Object.entries(summary)) {
        const e = entry as Record<string, { total: number; covered: number; pct: number | string }>;
        if (!e?.lines || !e?.statements || !e?.functions || !e?.branches) continue;
        const filePath = key === 'total' ? '__total__' : key;
        db.run(
          `INSERT OR REPLACE INTO current_coverage (
            repo_id, package, file_path,
            lines_total, lines_covered, lines_pct,
            statements_total, statements_covered, statements_pct,
            functions_total, functions_covered, functions_pct,
            branches_total, branches_covered, branches_pct,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            repoId, pkgDir, filePath,
            e.lines.total, e.lines.covered, toPct(e.lines.pct),
            e.statements.total, e.statements.covered, toPct(e.statements.pct),
            e.functions.total, e.functions.covered, toPct(e.functions.pct),
            e.branches.total, e.branches.covered, toPct(e.branches.pct),
            now,
          ],
        );
        count++;
      }
    }
    return count;
  }

  getCurrentCoverage(repoName: string): CurrentCoverageRow[] {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repos を LEFT JOIN して射影し、repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const repoId = this.repoIdForNameReadonly(repoName);
    const result = db.exec(
      `SELECT COALESCE(r.repo_name, '') AS repo_name, c.package, c.file_path, c.lines_total, c.lines_covered, c.lines_pct, c.statements_total, c.statements_covered, c.statements_pct, c.functions_total, c.functions_covered, c.functions_pct, c.branches_total, c.branches_covered, c.branches_pct, c.updated_at
       FROM current_coverage c LEFT JOIN repos r ON r.repo_id = c.repo_id WHERE c.repo_id = ?`,
      [repoId],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: asText(r[0] ?? ''),
      package: asText(r[1] ?? ''),
      file_path: asText(r[2] ?? ''),
      lines_total: Number(r[3] ?? 0),
      lines_covered: Number(r[4] ?? 0),
      lines_pct: Number(r[5] ?? 0),
      statements_total: Number(r[6] ?? 0),
      statements_covered: Number(r[7] ?? 0),
      statements_pct: Number(r[8] ?? 0),
      functions_total: Number(r[9] ?? 0),
      functions_covered: Number(r[10] ?? 0),
      functions_pct: Number(r[11] ?? 0),
      branches_total: Number(r[12] ?? 0),
      branches_covered: Number(r[13] ?? 0),
      branches_pct: Number(r[14] ?? 0),
      updated_at: asText(r[15] ?? ''),
    }));
  }

  getAllCurrentCoverage(): CurrentCoverageRow[] {
    const db = this.ensureDb();
    // Phase H-3: repo_name は current_coverage に無い。repos を LEFT JOIN して射影する (結果キーは不変)。
    // 未解決 repo_id (0/NULL) 行も同期から落とさないため LEFT JOIN + COALESCE(r.repo_name, '')。
    const result = db.exec(
      `SELECT COALESCE(r.repo_name, '') AS repo_name, c.package, c.file_path, c.lines_total, c.lines_covered, c.lines_pct, c.statements_total, c.statements_covered, c.statements_pct, c.functions_total, c.functions_covered, c.functions_pct, c.branches_total, c.branches_covered, c.branches_pct, c.updated_at, c.repo_id
       FROM current_coverage c LEFT JOIN repos r ON r.repo_id = c.repo_id`,
    );
    const values = result[0]?.values ?? [];
    // NaN-safe converter: istanbul/v8 stores "Unknown" for pct when total=0
    // Number("Unknown") = NaN, which JSON.stringify serializes as null → Supabase NOT NULL violation
    const toNum = (v: unknown): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
    return values.map((r) => ({
      repo_name: asText(r[0] ?? ''),
      package: asText(r[1] ?? ''),
      file_path: asText(r[2] ?? ''),
      lines_total: toNum(r[3]),
      lines_covered: toNum(r[4]),
      lines_pct: toNum(r[5]),
      statements_total: toNum(r[6]),
      statements_covered: toNum(r[7]),
      statements_pct: toNum(r[8]),
      functions_total: toNum(r[9]),
      functions_covered: toNum(r[10]),
      functions_pct: toNum(r[11]),
      branches_total: toNum(r[12]),
      branches_covered: toNum(r[13]),
      branches_pct: toNum(r[14]),
      updated_at: asText(r[15] ?? ''),
      repo_id: Number(r[16] ?? 0),
    }));
  }

  // ---------------------------------------------------------------------------
  //  File Analysis (Dead Code Detection)
  // ---------------------------------------------------------------------------

  /** Convert FileAnalysisRow signals/booleans to the shared SQL parameter array (without leading tag). */
  private fileAnalysisRowParams(r: FileAnalysisRow): unknown[] {
    return [
      r.repoName, r.filePath,
      r.importanceScore, r.fanInTotal, r.cognitiveComplexityMax, r.lineCount, r.cyclomaticComplexityMax, r.functionCount,
      r.deadCodeScore,
      r.signals.orphan ? 1 : 0,
      r.signals.fanInZero ? 1 : 0,
      r.signals.noRecentChurn ? 1 : 0,
      r.signals.zeroCoverage ? 1 : 0,
      r.signals.isolatedCommunity ? 1 : 0,
      r.isIgnored ? 1 : 0, r.ignoreReason,
      r.crossPkgInCount, r.externalConsumerPkgs, r.totalInCount, r.isBarrel ? 1 : 0, r.centralityScore,
      r.category, r.analyzedAt,
    ];
  }

  upsertCurrentFileAnalysis(rows: readonly FileAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    // Phase C-2 flip: current_file_analysis は (repo_id, file_path) PK。
    // Phase H-3: repo_name 列は撤去済。fileAnalysisRowParams は先頭に repo_name を含む (release 系で使用)
    // ため、current は repo_id を先頭に置き repo_name を slice(1) で除いて続ける。
    for (const r of rows) {
      const repoId = this.repoIdForName(r.repoName);
      db.run(
        `INSERT OR REPLACE INTO current_file_analysis (
          repo_id, file_path,
          importance_score, fan_in_total, cognitive_complexity_max, line_count, cyclomatic_complexity_max, function_count,
          dead_code_score,
          signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
          signal_zero_coverage, signal_isolated_community,
          is_ignored, ignore_reason,
          cross_pkg_in_count, external_consumer_pkgs, total_in_count, is_barrel, centrality_score,
          category,
          analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [repoId, ...this.fileAnalysisRowParams(r).slice(1)],
      );
    }
    this.save();
  }

  getCurrentFileAnalysis(repoName: string): FileAnalysisRow[] {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repos を LEFT JOIN して射影し、repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。未解決 repo_id 行も
    // 黙って落とさないため LEFT JOIN + COALESCE(rp.repo_name, '')。
    const repoId = this.repoIdForNameReadonly(repoName);
    const result = db.exec(
      `SELECT COALESCE(rp.repo_name, '') AS repo_name, fa.file_path,
              fa.importance_score, fa.fan_in_total, fa.cognitive_complexity_max, fa.line_count, fa.cyclomatic_complexity_max, fa.function_count,
              fa.dead_code_score,
              fa.signal_orphan, fa.signal_fan_in_zero, fa.signal_no_recent_churn,
              fa.signal_zero_coverage, fa.signal_isolated_community,
              fa.is_ignored, fa.ignore_reason,
              fa.cross_pkg_in_count, fa.external_consumer_pkgs, fa.total_in_count, fa.is_barrel, fa.centrality_score,
              fa.category,
              fa.analyzed_at
       FROM current_file_analysis fa LEFT JOIN repos rp ON rp.repo_id = fa.repo_id WHERE fa.repo_id = ?`,
      [repoId],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: asText(r[0] ?? ''),
      filePath: asText(r[1] ?? ''),
      importanceScore: Number(r[2] ?? 0),
      fanInTotal: Number(r[3] ?? 0),
      cognitiveComplexityMax: Number(r[4] ?? 0),
      lineCount: Number(r[5] ?? 0),
      cyclomaticComplexityMax: Number(r[6] ?? 0),
      functionCount: Number(r[7] ?? 0),
      deadCodeScore: Number(r[8] ?? 0),
      signals: {
        orphan: Number(r[9] ?? 0) === 1,
        fanInZero: Number(r[10] ?? 0) === 1,
        noRecentChurn: Number(r[11] ?? 0) === 1,
        zeroCoverage: Number(r[12] ?? 0) === 1,
        isolatedCommunity: Number(r[13] ?? 0) === 1,
      },
      isIgnored: Number(r[14] ?? 0) === 1,
      ignoreReason: asText(r[15] ?? ''),
      crossPkgInCount: Number(r[16] ?? 0),
      externalConsumerPkgs: Number(r[17] ?? 0),
      totalInCount: Number(r[18] ?? 0),
      isBarrel: Number(r[19] ?? 0) === 1,
      centralityScore: Number(r[20] ?? 0),
      category: parseCategory(r[21]),
      analyzedAt: asText(r[22] ?? ''),
    }));
  }

  clearCurrentFileAnalysis(repoName: string): void {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 「指定 repo の行を削除」のため未登録 repo を upsert する必要はない。repoIdForNameReadonly で
    // 解決 (未登録は -1 → 何も削除しない)。ghost repo 行を作らない。
    db.run('DELETE FROM current_file_analysis WHERE repo_id = ?', [this.repoIdForNameReadonly(repoName)]);
    this.save();
  }

  upsertReleaseFileAnalysis(releaseTag: string, rows: readonly FileAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    // flip 後 release_file_analysis は release_id FK。tag を解決する。
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) {
      this.logger.warn(`[upsertReleaseFileAnalysis] no release for tag=${releaseTag}, skip`);
      return;
    }
    // Phase H-5: release_file_analysis.repo_name 列は撤去済。fileAnalysisRowParams は先頭に repo_name を
    // 含む (current 系で slice(1) して使う) ため、release も release_id を先頭に置き repo_name を slice(1) で
    // 除いて続ける。repo 帰属は release_id FK (releases→repos) で表現する。
    for (const r of rows) {
      db.run(
        `INSERT OR REPLACE INTO release_file_analysis (
          release_id, file_path,
          importance_score, fan_in_total, cognitive_complexity_max, line_count, cyclomatic_complexity_max, function_count,
          dead_code_score,
          signal_orphan, signal_fan_in_zero, signal_no_recent_churn,
          signal_zero_coverage, signal_isolated_community,
          is_ignored, ignore_reason,
          cross_pkg_in_count, external_consumer_pkgs, total_in_count, is_barrel, centrality_score,
          category,
          analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [releaseId, ...this.fileAnalysisRowParams(r).slice(1)],
      );
    }
  }

  getReleaseFileAnalysis(releaseTag: string, _repoName: string): FileAnalysisRow[] {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) return [];
    // Phase H-5: release_file_analysis.repo_name 列は撤去済。release_id が (repo, tag) を一意に決めるため
    // repo フィルタは release_id のみで十分 (旧 repoName 引数は冗長になったため未使用)。結果の repoName は
    // releases.repo_id → repos を LEFT JOIN して射影する (repo_id 未解決/sentinel は '' = 旧 repo_name='' と
    // 等価・結果キー repoName は不変)。
    const result = db.exec(
      `SELECT COALESCE(repo.repo_name, '') AS repo_name, rfa.file_path,
              rfa.importance_score, rfa.fan_in_total, rfa.cognitive_complexity_max, rfa.line_count, rfa.cyclomatic_complexity_max, rfa.function_count,
              rfa.dead_code_score,
              rfa.signal_orphan, rfa.signal_fan_in_zero, rfa.signal_no_recent_churn,
              rfa.signal_zero_coverage, rfa.signal_isolated_community,
              rfa.is_ignored, rfa.ignore_reason,
              rfa.cross_pkg_in_count, rfa.external_consumer_pkgs, rfa.total_in_count, rfa.is_barrel, rfa.centrality_score,
              rfa.category,
              rfa.analyzed_at
       FROM release_file_analysis rfa
       JOIN releases rel ON rel.release_id = rfa.release_id
       LEFT JOIN repos repo ON repo.repo_id = rel.repo_id
       WHERE rfa.release_id = ?`,
      [releaseId],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: asText(r[0] ?? ''),
      filePath: asText(r[1] ?? ''),
      importanceScore: Number(r[2] ?? 0),
      fanInTotal: Number(r[3] ?? 0),
      cognitiveComplexityMax: Number(r[4] ?? 0),
      lineCount: Number(r[5] ?? 0),
      cyclomaticComplexityMax: Number(r[6] ?? 0),
      functionCount: Number(r[7] ?? 0),
      deadCodeScore: Number(r[8] ?? 0),
      signals: {
        orphan: Number(r[9] ?? 0) === 1,
        fanInZero: Number(r[10] ?? 0) === 1,
        noRecentChurn: Number(r[11] ?? 0) === 1,
        zeroCoverage: Number(r[12] ?? 0) === 1,
        isolatedCommunity: Number(r[13] ?? 0) === 1,
      },
      isIgnored: Number(r[14] ?? 0) === 1,
      ignoreReason: asText(r[15] ?? ''),
      crossPkgInCount: Number(r[16] ?? 0),
      externalConsumerPkgs: Number(r[17] ?? 0),
      totalInCount: Number(r[18] ?? 0),
      isBarrel: Number(r[19] ?? 0) === 1,
      centralityScore: Number(r[20] ?? 0),
      category: parseCategory(r[21]),
      analyzedAt: asText(r[22] ?? ''),
    }));
  }

  clearReleaseFileAnalysis(releaseTag: string, _repoName: string): void {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) return;
    // Phase H-5: release_file_analysis.repo_name 列は撤去済。release_id が (repo, tag) を一意に決めるため
    // repo フィルタは release_id のみで十分 (旧 repoName 引数は冗長になったため未使用)。
    db.run('DELETE FROM release_file_analysis WHERE release_id = ?', [releaseId]);
    this.save();
  }

  // ---------------------------------------------------------------------------
  //  Function Analysis (Dead Code Detection)
  // ---------------------------------------------------------------------------

  upsertCurrentFunctionAnalysis(rows: readonly FunctionAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    // Phase C-2 flip: current_function_analysis は (repo_id, file_path, function_name, start_line) PK。
    // Phase H-3: repo_name 列は撤去済 (repo フィルタは repo_id = ? で行う)。
    for (const r of rows) {
      const repoId = this.repoIdForName(r.repoName);
      db.run(
        `INSERT OR REPLACE INTO current_function_analysis (
          repo_id, file_path, function_name, start_line,
          end_line, language, fan_in, cognitive_complexity, cyclomatic_complexity,
          data_mutation_score, side_effect_score, line_count,
          importance_score, signal_fan_in_zero,
          fan_out, distinct_callees, function_role,
          analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          repoId, r.filePath, r.functionName, r.startLine,
          r.endLine, r.language, r.fanIn, r.cognitiveComplexity, r.cyclomaticComplexity,
          r.dataMutationScore, r.sideEffectScore, r.lineCount,
          r.importanceScore, r.signalFanInZero ? 1 : 0,
          r.fanOut, r.distinctCallees, r.functionRole,
          r.analyzedAt,
        ],
      );
    }
    this.save();
  }

  getCurrentFunctionAnalysis(repoName: string): FunctionAnalysisRow[] {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repos を LEFT JOIN して射影し、repo フィルタは repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。未解決 repo_id 行も
    // 黙って落とさないため LEFT JOIN + COALESCE(rp.repo_name, '')。
    const repoId = this.repoIdForNameReadonly(repoName);
    const result = db.exec(
      `SELECT COALESCE(rp.repo_name, '') AS repo_name, fn.file_path, fn.function_name, fn.start_line,
              fn.end_line, fn.language, fn.fan_in, fn.cognitive_complexity, fn.cyclomatic_complexity,
              fn.data_mutation_score, fn.side_effect_score, fn.line_count,
              fn.importance_score, fn.signal_fan_in_zero,
              fn.fan_out, fn.distinct_callees, fn.function_role,
              fn.analyzed_at
       FROM current_function_analysis fn LEFT JOIN repos rp ON rp.repo_id = fn.repo_id WHERE fn.repo_id = ?`,
      [repoId],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: asText(r[0] ?? ''),
      filePath: asText(r[1] ?? ''),
      functionName: asText(r[2] ?? ''),
      startLine: Number(r[3] ?? 0),
      endLine: Number(r[4] ?? 0),
      language: asText(r[5] ?? ''),
      fanIn: Number(r[6] ?? 0),
      cognitiveComplexity: Number(r[7] ?? 0),
      cyclomaticComplexity: Number(r[8] ?? 0),
      dataMutationScore: Number(r[9] ?? 0),
      sideEffectScore: Number(r[10] ?? 0),
      lineCount: Number(r[11] ?? 0),
      importanceScore: Number(r[12] ?? 0),
      signalFanInZero: Number(r[13] ?? 0) === 1,
      fanOut: Number(r[14] ?? 0),
      distinctCallees: Number(r[15] ?? 0),
      functionRole: (['hub', 'leaf', 'orchestrator', 'peripheral'].includes(asText(r[16] ?? '')) ? asText(r[16]) : 'peripheral') as 'hub' | 'leaf' | 'orchestrator' | 'peripheral',
      analyzedAt: asText(r[17] ?? ''),
    }));
  }

  clearCurrentFunctionAnalysis(repoName: string): void {
    const db = this.ensureDb();
    // Phase H-3: repo_name 列は撤去済。repo フィルタは repo_id = ? で行う。
    // 「指定 repo の行を削除」のため未登録 repo を upsert する必要はない。repoIdForNameReadonly で
    // 解決 (未登録は -1 → 何も削除しない)。ghost repo 行を作らない。
    db.run('DELETE FROM current_function_analysis WHERE repo_id = ?', [this.repoIdForNameReadonly(repoName)]);
    this.save();
  }

  upsertReleaseFunctionAnalysis(releaseTag: string, rows: readonly FunctionAnalysisRow[]): void {
    if (rows.length === 0) return;
    const db = this.ensureDb();
    // flip 後 release_function_analysis は release_id FK。tag を解決する。
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) {
      this.logger.warn(`[upsertReleaseFunctionAnalysis] no release for tag=${releaseTag}, skip`);
      return;
    }
    // Phase H-5: release_function_analysis.repo_name 列は撤去済。repo 帰属は release_id FK
    // (releases→repos) で表現する。INSERT 列から repo_name を除く。
    for (const r of rows) {
      db.run(
        `INSERT OR REPLACE INTO release_function_analysis (
          release_id, file_path, function_name, start_line,
          end_line, language, fan_in, cognitive_complexity, cyclomatic_complexity,
          data_mutation_score, side_effect_score, line_count,
          importance_score, signal_fan_in_zero,
          fan_out, distinct_callees, function_role,
          analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          releaseId, r.filePath, r.functionName, r.startLine,
          r.endLine, r.language, r.fanIn, r.cognitiveComplexity, r.cyclomaticComplexity,
          r.dataMutationScore, r.sideEffectScore, r.lineCount,
          r.importanceScore, r.signalFanInZero ? 1 : 0,
          r.fanOut, r.distinctCallees, r.functionRole,
          r.analyzedAt,
        ],
      );
    }
    this.save();
  }

  getReleaseFunctionAnalysis(releaseTag: string, _repoName: string): FunctionAnalysisRow[] {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) return [];
    // Phase H-5: release_function_analysis.repo_name 列は撤去済。release_id が (repo, tag) を一意に決めるため
    // repo フィルタは release_id のみで十分 (旧 repoName 引数は冗長になったため未使用)。結果の repoName は
    // releases.repo_id → repos を LEFT JOIN して射影する (結果キー repoName は不変)。
    const result = db.exec(
      `SELECT COALESCE(repo.repo_name, '') AS repo_name, rfa.file_path, rfa.function_name, rfa.start_line,
              rfa.end_line, rfa.language, rfa.fan_in, rfa.cognitive_complexity, rfa.cyclomatic_complexity,
              rfa.data_mutation_score, rfa.side_effect_score, rfa.line_count,
              rfa.importance_score, rfa.signal_fan_in_zero,
              rfa.fan_out, rfa.distinct_callees, rfa.function_role,
              rfa.analyzed_at
       FROM release_function_analysis rfa
       JOIN releases rel ON rel.release_id = rfa.release_id
       LEFT JOIN repos repo ON repo.repo_id = rel.repo_id
       WHERE rfa.release_id = ?`,
      [releaseId],
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repoName: asText(r[0] ?? ''),
      filePath: asText(r[1] ?? ''),
      functionName: asText(r[2] ?? ''),
      startLine: Number(r[3] ?? 0),
      endLine: Number(r[4] ?? 0),
      language: asText(r[5] ?? ''),
      fanIn: Number(r[6] ?? 0),
      cognitiveComplexity: Number(r[7] ?? 0),
      cyclomaticComplexity: Number(r[8] ?? 0),
      dataMutationScore: Number(r[9] ?? 0),
      sideEffectScore: Number(r[10] ?? 0),
      lineCount: Number(r[11] ?? 0),
      importanceScore: Number(r[12] ?? 0),
      signalFanInZero: Number(r[13] ?? 0) === 1,
      fanOut: Number(r[14] ?? 0),
      distinctCallees: Number(r[15] ?? 0),
      functionRole: (['hub', 'leaf', 'orchestrator', 'peripheral'].includes(asText(r[16] ?? '')) ? asText(r[16]) : 'peripheral') as 'hub' | 'leaf' | 'orchestrator' | 'peripheral',
      analyzedAt: asText(r[17] ?? ''),
    }));
  }

  clearReleaseFunctionAnalysis(releaseTag: string, _repoName: string): void {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) return;
    // Phase H-5: release_function_analysis.repo_name 列は撤去済。release_id が (repo, tag) を一意に決めるため
    // repo フィルタは release_id のみで十分 (旧 repoName 引数は冗長になったため未使用)。
    db.run('DELETE FROM release_function_analysis WHERE release_id = ?', [releaseId]);
    this.save();
  }

  // -------------------------------------------------------------------------
  //  Releases
  // -------------------------------------------------------------------------

  private insertReleaseFiles(
    db: Database,
    git: ExecFileGitService,
    prevTag: string,
    tag: string,
    relId: number,
  ): void {
    const fileStats = git.getFileStatsByRange(prevTag, tag);
    for (const f of fileStats) {
      try {
        db.run(
          `INSERT OR IGNORE INTO release_files (release_id, file_path, lines_added, lines_deleted, change_type)
           VALUES (?, ?, ?, ?, ?)`,
          [relId, f.filePath, f.linesAdded, f.linesDeleted, f.changeType],
        );
      } catch { /* ignore */ }
    }
  }

  private backfillExistingRelease(
    db: Database,
    git: ExecFileGitService,
    relId: number,
    tag: string,
    prevTag: string | null,
  ): boolean {
    let updated = false;
    const totalLinesResult = db.exec('SELECT total_lines FROM releases WHERE release_id = ?', [relId]);
    const existingTotalLines = Number(totalLinesResult[0]?.values?.[0]?.[0] ?? 0);
    if (existingTotalLines === 0) {
      const snapshotLines = git.getSnapshotLineCount(tag);
      if (snapshotLines > 0) {
        try {
          db.run(`UPDATE releases SET total_lines = ? WHERE release_id = ?`, [snapshotLines, relId]);
          updated = true;
        } catch {
          // ignore backfill failures
        }
      }
    }
    if (prevTag) {
      const filesExist = db.exec('SELECT COUNT(*) FROM release_files WHERE release_id = ?', [relId]);
      if ((filesExist[0]?.values?.[0]?.[0] as number) <= 0) {
        const fileStats = git.getFileStatsByRange(prevTag, tag);
        this.insertReleaseFiles(db, git, prevTag, tag, relId);
        if (fileStats.length > 0) updated = true;
      }
    }
    return updated;
  }

  private insertNewRelease(
    db: Database,
    git: ExecFileGitService,
    tag: string,
    prevTag: string | null,
    repoName: string,
    repoId: number,
  ): void {
    const commitHash = git.getTagCommitHash(tag);
    const allTagsAtCommit = git.getTagsAtCommit(commitHash);
    const packageTags = allTagsAtCommit.filter((t) => t !== tag && !t.startsWith('v'));
    const releasedAt = git.getTagDate(tag);
    const prevReleasedAt = prevTag ? git.getTagDate(prevTag) : null;

    const commitSubjects = prevTag ? git.getCommitSubjects(prevTag, tag) : [];
    const stats = prevTag
      ? git.getDiffStats(prevTag, tag)
      : { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
    const packages = prevTag ? git.getChangedPackages(prevTag, tag) : [];
    const totalLines = git.getSnapshotLineCount(tag);

    const release = buildReleaseFromGitData({
      tag, prevTag, releasedAt, prevReleasedAt, repoName, packageTags, commitSubjects,
      filesChanged: stats.filesChanged, linesAdded: stats.linesAdded, linesDeleted: stats.linesDeleted,
      totalLines, affectedPackages: packages,
    });

    const prevReleaseId = release.prevTag ? this.releaseIdForTag(db, release.prevTag) : null;

    db.run(
      `INSERT INTO releases (
        tag, released_at, prev_release_id, repo_id, package_tags,
        commit_count, files_changed, lines_added, lines_deleted,
        total_lines,
        feat_count, fix_count, refactor_count, test_count, other_count,
        affected_packages, duration_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        release.tag, release.releasedAt, prevReleaseId, repoId,
        JSON.stringify(release.packageTags), release.commitCount,
        release.filesChanged, release.linesAdded, release.linesDeleted, release.totalLines,
        release.featCount, release.fixCount, release.refactorCount, release.testCount, release.otherCount,
        JSON.stringify(release.affectedPackages), release.durationDays,
      ],
    );

    const newRelId = this.releaseIdForTag(db, release.tag);
    if (prevTag && newRelId != null) {
      this.insertReleaseFiles(db, git, prevTag, tag, newRelId);
    }
  }

  resolveReleases(gitRoot: string): number {
    const db = this.ensureDb();
    const git = new ExecFileGitService(gitRoot);
    const tags = git.getVersionTags();
    let count = 0;

    // flip 後 releases は repo 内で UNIQUE (repo_id, tag)。repo_id を一度だけ解決する
    // (repoIdForName は upsert で repos に登録する)。
    const repoName = path.basename(gitRoot);
    const repoId = this.repoIdForName(repoName);

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const prevTag = i + 1 < tags.length ? tags[i + 1] : null;
      const existingRes = db.exec('SELECT release_id FROM releases WHERE tag = ? LIMIT 1', [tag]);
      const existingReleaseId = existingRes[0]?.values?.[0]?.[0];
      if (existingReleaseId != null) {
        // Release exists — backfill release_files/total_lines if missing
        const updated = this.backfillExistingRelease(db, git, Number(existingReleaseId), tag, prevTag);
        if (updated) count++;
        continue;
      }

      this.insertNewRelease(db, git, tag, prevTag, repoName, repoId);
      count++;
    }

    // flip: prev_release_id の解決 2nd pass。tags は新しい順なので 1st pass 時点では
    // prev (古い) release が未挿入で prev_release_id が null になる。全 release 挿入後に
    // tag ペア (tags[i] → tags[i+1]) で prev_release_id を埋める (同 repo_id 内)。
    for (let i = 0; i + 1 < tags.length; i++) {
      const tag = tags[i];
      const prevTag = tags[i + 1];
      const prevReleaseId = this.releaseIdForTag(db, prevTag);
      if (prevReleaseId == null) continue;
      try {
        db.run(
          'UPDATE releases SET prev_release_id = ? WHERE tag = ? AND repo_id IS ? AND prev_release_id IS NULL',
          [prevReleaseId, tag, repoId],
        );
      } catch { /* ignore */ }
    }

    if (count > 0) this.save();
    return count;
  }

  /** Find the minimum elapsed minutes from any session start to a release timestamp (max 720 min). */
  private findMinElapsedMinutes(
    relMs: number,
    sessions: ReadonlyArray<{ skill_start: string }>,
  ): number | null {
    let minElapsed: number | null = null;
    for (const sess of sessions) {
      const startMs = new Date(sess.skill_start).getTime();
      if (relMs < startMs) continue;
      const elapsedMin = (relMs - startMs) / 60_000;
      if (elapsedMin > 720) continue;
      if (minElapsed === null || elapsedMin < minElapsed) minElapsed = elapsedMin;
    }
    return minElapsed;
  }

  /**
   * production-release スキルの開始時刻と releases.released_at の差分（分）を算出し
   * release_time_min が未設定のリリースを一括更新する。
   * マッチング条件: セッション開始から 6 時間（0.25 日）以内に released_at が入る最小経過時間。
   */
  resolveReleaseTimes(): number {
    const db = this.ensureDb();

    const sessResult = db.exec(`
      SELECT session_id, MIN(timestamp) AS skill_start
      FROM messages
      WHERE skill = 'production-release' AND type = 'assistant'
      GROUP BY session_id
    `);
    if (!sessResult[0]?.values?.length) return 0;

    const cols = sessResult[0].columns;
    const sessions = sessResult[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      return obj as { session_id: string; skill_start: string };
    });

    const relResult = db.exec(`
      SELECT tag, released_at FROM releases
      WHERE released_at IS NOT NULL AND released_at != '' AND release_time_min IS NULL
    `);
    if (!relResult[0]?.values?.length) return 0;

    const relCols = relResult[0].columns;
    const releases = relResult[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < relCols.length; i++) obj[relCols[i]] = row[i];
      return obj as { tag: string; released_at: string };
    });

    let updated = 0;
    for (const rel of releases) {
      const relMs = new Date(rel.released_at).getTime();
      const minElapsed = this.findMinElapsedMinutes(relMs, sessions);
      if (minElapsed !== null) {
        try {
          db.run('UPDATE releases SET release_time_min = ? WHERE tag = ?', [
            Math.round(minElapsed * 10) / 10,
            rel.tag,
          ]);
          updated++;
        } catch { /* ignore */ }
      }
    }
    return updated;
  }

  /**
   * releases テーブルの各リリースタグのソースコードを git worktree でチェックアウトして解析し、
   * release_graphs テーブルにタグ ID で保存する。
   * 既に release_graphs に同タグが存在する場合はスキップ。
   */
  /** Remove a git worktree directory, falling back to fs.rmSync on error. */
  private removeWorktreeDir(tmpDir: string, gitRoot: string): void {
    try {
      execFileSync('git', ['worktree', 'remove', tmpDir, '--force'], { cwd: gitRoot, stdio: 'pipe' });
    } catch {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Analyze one release tag in a temporary worktree. Returns true if the graph was saved.
   * Throws on unrecoverable errors; caller is responsible for worktree cleanup in finally.
   */
  private async analyzeOneRelease(
    tag: string,
    gitRoot: string,
    tmpDir: string,
    opts: { tsconfigPath: string; git: ExecFileGitService; analyzeFn: AnalyzeFunction; excludePatterns: readonly string[]; onProgress?: (message: string) => void },
  ): Promise<boolean> {
    const { tsconfigPath, git, analyzeFn, excludePatterns, onProgress } = opts;
    onProgress?.(`Analyzing release ${tag}...`);

    if (fs.existsSync(tmpDir)) this.removeWorktreeDir(tmpDir, gitRoot);

    const commitHash = git.getTagCommitHash(tag);
    execFileSync('git', ['worktree', 'add', '--detach', tmpDir, commitHash], { cwd: gitRoot, stdio: 'pipe' });

    const worktreeTsconfig = path.join(tmpDir, 'tsconfig.json');
    if (!fs.existsSync(worktreeTsconfig)) {
      onProgress?.(`Skipping ${tag}: tsconfig.json not found`);
      return false;
    }

    const worktreeNodeModules = path.join(tmpDir, 'node_modules');
    if (!fs.existsSync(worktreeNodeModules)) {
      fs.symlinkSync(path.join(gitRoot, 'node_modules'), worktreeNodeModules, 'dir');
    }

    const exclude = ignore();
    if (excludePatterns.length > 0) exclude.add([...excludePatterns]);
    const graph = await analyzeFn({ tsconfigPath: worktreeTsconfig, exclude });

    this.saveReleaseGraph(graph, tsconfigPath, tag);
    onProgress?.(`Release ${tag} analyzed: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    return true;
  }

  async analyzeReleases(
    gitRoot: string,
    analyzeFn: AnalyzeFunction,
    onProgress?: (message: string) => void,
    excludePatterns: readonly string[] = ['.worktrees', '.vscode-test', '__tests__', 'fixtures'],
  ): Promise<number> {
    const db = this.ensureDb();
    const releases = this.getReleases();
    if (releases.length === 0) return 0;

    // flip 後 release_graphs は release_id FK。dedup は tag ベースのため releases へ JOIN する。
    const existingResult = db.exec(
      `SELECT r.tag FROM release_graphs rg JOIN releases r ON r.release_id = rg.release_id`,
    );
    const existingIds = new Set<string>(
      existingResult[0]?.values?.map((r) => r[0] as string) ?? [],
    );

    const git = new ExecFileGitService(gitRoot);
    const tsconfigPath = path.join(gitRoot, 'tsconfig.json');
    let count = 0;

    for (const release of releases) {
      const tag = release.tag;
      if (existingIds.has(tag)) continue;
      const tmpDir = path.join(os.tmpdir(), `trail-release-${tag.replaceAll('/', '-')}`);
      try {
        const saved = await this.analyzeOneRelease(tag, gitRoot, tmpDir, { tsconfigPath, git, analyzeFn, excludePatterns, onProgress });
        if (saved) {
          existingIds.add(tag);
          count++;
        }
      } catch (e) {
        onProgress?.(`Skipping ${tag}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        this.removeWorktreeDir(tmpDir, gitRoot);
      }
    }

    return count;
  }

  getReleases(): ReleaseRow[] {
    const db = this.ensureDb();
    // flip 後 releases は prev_release_id を持つ。外部 I/F (Supabase 同期) は従来通り
    // prev_tag を期待するため、自己 JOIN で prev_release_id → prev.tag を解決して供給する。
    // Phase H-5: releases.repo_name 列は撤去済。SyncService が Supabase trail_releases へ運ぶ repo_name を
    // 含む契約 (ReleaseRow.repo_name) を維持するため repos を LEFT JOIN して COALESCE(repo.repo_name, '')
    // を repo_name として射影する (repo_id 未解決/sentinel は '' = 旧 repo_name='' と等価・結果キーは不変)。
    const result = db.exec(
      `SELECT r.*, COALESCE(repo.repo_name, '') AS repo_name, p.tag AS prev_tag
         FROM releases r
         LEFT JOIN repos repo ON repo.repo_id = r.repo_id
         LEFT JOIN releases p ON p.release_id = r.prev_release_id
        ORDER BY r.released_at DESC`,
    );
    if (!result[0]) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = row[i];
      }
      return obj as unknown as ReleaseRow;
    });
  }

  /**
   * 指定リポジトリで指定日時以降にコミットされたファイル別の出現回数（churn）を返す。
   * 1 コミットで同ファイルが複数回現れることはないので、出現回数 = コミット数。
   *
   * @param repoName セッションの repo_name 一致条件（sessions.repo_name）
   * @param sinceIso UTC ISO 8601 文字列（この日時以降のコミットを対象とする）
   * @returns file_path → コミット出現回数のマップ。file_path は git 相対パス
   */
  getCommitFilesChurnSince(repoName: string, sinceIso: string): Map<string, number> {
    const db = this.ensureDb();
    // Phase H-4: sessions.repo_name 列は撤去済。repo フィルタは s.repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const result = db.exec(
      `SELECT cf.file_path, COUNT(DISTINCT cf.commit_hash) AS cnt
       FROM commit_files cf
       JOIN session_commits sc ON sc.commit_hash = cf.commit_hash
       JOIN sessions s ON s.id = sc.session_id
       WHERE sc.committed_at >= ? AND s.repo_id = ?
       GROUP BY cf.file_path`,
      [sinceIso, this.repoIdForNameReadonly(repoName)],
    );
    const out = new Map<string, number>();
    const values = result[0]?.values ?? [];
    for (const r of values) {
      out.set(asText(r[0] ?? ''), Number(r[1] ?? 0));
    }
    return out;
  }

  /**
   * 指定リポジトリで過去に 1 回でも commit に登場した file_path 集合を返す。
   * 期間制約なし。dead code 解析の `hasHistory` 判定で使う
   * (`getCommitFilesChurnSince` は recent 窓のみ返すため `hasHistory && churn===0` が常に false になる問題への対応)。
   */
  getCommitFilesEverChurned(repoName: string): Set<string> {
    const db = this.ensureDb();
    // Phase H-4: sessions.repo_name 列は撤去済。repo フィルタは s.repo_id = ? で行う。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const result = db.exec(
      `SELECT DISTINCT cf.file_path
       FROM commit_files cf
       JOIN session_commits sc ON sc.commit_hash = cf.commit_hash
       JOIN sessions s ON s.id = sc.session_id
       WHERE s.repo_id = ?`,
      [this.repoIdForNameReadonly(repoName)],
    );
    const out = new Set<string>();
    const values = result[0]?.values ?? [];
    for (const r of values) out.add(asText(r[0] ?? ''));
    return out;
  }

  getCommitFiles(commitHashes: string[]): Array<{ repo_id: number; repo_name: string; commit_hash: string; file_path: string }> {
    if (commitHashes.length === 0) return [];
    const db = this.ensureDb();
    const placeholders = commitHashes.map(() => '?').join(',');
    // Phase H-4: commit_files.repo_name 列は撤去済。SyncService が Supabase trail_commit_files へ運ぶ
    // repo_name を含む契約を維持するため repos を LEFT JOIN して COALESCE(r.repo_name, '') を射影する
    // (repo_id=0 sentinel など未解決は '' = 旧 repo_name='' と等価・結果キーは不変)。
    // Supabase 正規化ミラー用に cf.repo_id を末尾へ additive 投影する (repo_name は拡張ローカル UI 互換のため保持)。
    const res = db.exec(
      `SELECT COALESCE(r.repo_name, '') AS repo_name, cf.commit_hash, cf.file_path, cf.repo_id
       FROM commit_files cf
       LEFT JOIN repos r ON r.repo_id = cf.repo_id
       WHERE cf.commit_hash IN (${placeholders})`,
      commitHashes,
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({
      repo_name: row[0] as string,
      commit_hash: row[1] as string,
      file_path: row[2] as string,
      repo_id: Number(row[3] ?? 0),
    }));
  }

  getReleaseQualityInputs(from: string, to: string): {
    releases: Array<{ tag_date: string }>;
    commits: Array<{ hash: string; subject: string; committed_at: string; files: string[] }>;
  } {
    const db = this.ensureDb();

    const relRes = db.exec(
      `SELECT released_at FROM releases WHERE released_at >= ? AND released_at <= ? ORDER BY released_at`,
      [from, to],
    );
    const releases = (relRes[0]?.values ?? []).map((row) => ({ tag_date: row[0] as string }));
    if (releases.length === 0) return { releases: [], commits: [] };

    // コミット取得: range + 168h 拡張（post-deploy fix 検出ウィンドウ）
    const FIX_WINDOW_MS = 168 * 60 * 60 * 1000;
    const extTo = new Date(new Date(to).getTime() + FIX_WINDOW_MS).toISOString();

    const comRes = db.exec(
      `SELECT commit_hash, commit_message, committed_at
       FROM session_commits
       WHERE committed_at >= ? AND committed_at <= ?
       GROUP BY commit_hash`,
      [from, extTo],
    );
    const rows = (comRes[0]?.values ?? []).map((row) => ({
      hash: row[0] as string,
      subject: ((row[1] as string) ?? '').split('\n')[0],
      committed_at: row[2] as string,
      files: [] as string[],
    }));

    if (rows.length > 0) {
      const placeholders = rows.map(() => '?').join(',');
      const filesRes = db.exec(
        `SELECT commit_hash, file_path FROM commit_files WHERE commit_hash IN (${placeholders})`,
        rows.map((r) => r.hash),
      );
      if (filesRes[0]) {
        const fileMap = new Map<string, string[]>();
        for (const row of filesRes[0].values) {
          const hash = row[0] as string;
          const fp = row[1] as string;
          const arr = fileMap.get(hash);
          if (arr) arr.push(fp);
          else fileMap.set(hash, [fp]);
        }
        for (const row of rows) {
          row.files = fileMap.get(row.hash) ?? [];
        }
      }
    }

    return { releases, commits: rows };
  }

  getReleasesInRange(from: string, to: string): Array<{ tag: string; released_at: string }> {
    const db = this.ensureDb();
    const res = db.exec(
      `SELECT tag, released_at FROM releases WHERE released_at >= ? AND released_at <= ?`,
      [from, to],
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({ tag: row[0] as string, released_at: row[1] as string }));
  }

  getReleaseFiles(releaseTag: string): ReleaseFileRow[] {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) return [];
    // flip 後 release_files は release_id FK。外部 I/F は release_tag を期待するため
    // パラメータ tag をそのまま row に詰め直す (data 列のみ DB から取得)。
    const result = db.exec(
      `SELECT file_path, lines_added, lines_deleted, change_type
         FROM release_files WHERE release_id = ?`,
      [releaseId],
    );
    if (!result[0]?.values) return [];
    return result[0].values.map((row) => ({
      release_tag: releaseTag,
      release_id: releaseId,
      file_path: asText(row[0] ?? ''),
      lines_added: Number(row[1] ?? 0),
      lines_deleted: Number(row[2] ?? 0),
      change_type: asText(row[3] ?? 'modified'),
    }));
  }

  getCoverageByTag(releaseTag: string): ReleaseCoverageRow[] {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) return [];
    const result = db.exec(
      `SELECT package, file_path,
              lines_total, lines_covered, lines_pct,
              statements_total, statements_covered, statements_pct,
              functions_total, functions_covered, functions_pct,
              branches_total, branches_covered, branches_pct
         FROM release_coverage WHERE release_id = ?`,
      [releaseId],
    );
    if (!result[0]?.values) return [];
    const toNum = (v: unknown): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
    return result[0].values.map((r) => ({
      release_tag: releaseTag,
      package: asText(r[0] ?? ''),
      file_path: asText(r[1] ?? ''),
      lines_total: toNum(r[2]),
      lines_covered: toNum(r[3]),
      lines_pct: toNum(r[4]),
      statements_total: toNum(r[5]),
      statements_covered: toNum(r[6]),
      statements_pct: toNum(r[7]),
      functions_total: toNum(r[8]),
      functions_covered: toNum(r[9]),
      functions_pct: toNum(r[10]),
      branches_total: toNum(r[11]),
      branches_covered: toNum(r[12]),
      branches_pct: toNum(r[13]),
    }));
  }

  getAllReleaseCoverage(): ReleaseCoverageRow[] {
    const db = this.ensureDb();
    // flip 後は release_id FK。Supabase 同期は release_tag キーのため releases へ JOIN する。
    // Supabase 正規化ミラー用に r.release_id を末尾へ additive 投影する (release_tag は互換のため保持)。
    const result = db.exec(
      `SELECT r.tag, rc.package, rc.file_path,
              rc.lines_total, rc.lines_covered, rc.lines_pct,
              rc.statements_total, rc.statements_covered, rc.statements_pct,
              rc.functions_total, rc.functions_covered, rc.functions_pct,
              rc.branches_total, rc.branches_covered, rc.branches_pct, r.release_id
       FROM release_coverage rc JOIN releases r ON r.release_id = rc.release_id`,
    );
    const values = result[0]?.values ?? [];
    const toNum = (v: unknown): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
    return values.map((r) => ({
      release_tag: asText(r[0] ?? ''),
      package: asText(r[1] ?? ''),
      file_path: asText(r[2] ?? ''),
      lines_total: toNum(r[3]),
      lines_covered: toNum(r[4]),
      lines_pct: toNum(r[5]),
      statements_total: toNum(r[6]),
      statements_covered: toNum(r[7]),
      statements_pct: toNum(r[8]),
      functions_total: toNum(r[9]),
      functions_covered: toNum(r[10]),
      functions_pct: toNum(r[11]),
      branches_total: toNum(r[12]),
      branches_covered: toNum(r[13]),
      branches_pct: toNum(r[14]),
      release_id: Number(r[15] ?? 0),
    }));
  }

  // ---------------------------------------------------------------------------
  //  getAll* raw methods for Supabase sync (snake_case keys matching SQL columns)
  // ---------------------------------------------------------------------------

  getAllCurrentFileAnalysis(): Array<{
    repo_id: number; repo_name: string; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string;
    cross_pkg_in_count: number; external_consumer_pkgs: number; total_in_count: number; is_barrel: number; centrality_score: number;
    analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
    category: string;
  }> {
    const db = this.ensureDb();
    // Phase H-3: repo_name は current_file_analysis に無い。repos を LEFT JOIN して射影する (結果キーは不変)。
    // 未解決 repo_id (0/NULL) 行も同期から落とさないため LEFT JOIN + COALESCE(rp.repo_name, '')。
    const result = db.exec(
      `SELECT COALESCE(rp.repo_name, '') AS repo_name, fa.file_path, fa.importance_score, fa.fan_in_total, fa.cognitive_complexity_max, fa.function_count,
              fa.dead_code_score, fa.signal_orphan, fa.signal_fan_in_zero, fa.signal_no_recent_churn,
              fa.signal_zero_coverage, fa.signal_isolated_community, fa.is_ignored, fa.ignore_reason,
              fa.cross_pkg_in_count, fa.external_consumer_pkgs, fa.total_in_count, fa.is_barrel, fa.centrality_score,
              fa.analyzed_at, fa.line_count, fa.cyclomatic_complexity_max, fa.category, fa.repo_id
       FROM current_file_analysis fa LEFT JOIN repos rp ON rp.repo_id = fa.repo_id`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: asText(r[0] ?? ''),
      file_path: asText(r[1] ?? ''),
      importance_score: Number(r[2] ?? 0),
      fan_in_total: Number(r[3] ?? 0),
      cognitive_complexity_max: Number(r[4] ?? 0),
      function_count: Number(r[5] ?? 0),
      dead_code_score: Number(r[6] ?? 0),
      signal_orphan: Number(r[7] ?? 0),
      signal_fan_in_zero: Number(r[8] ?? 0),
      signal_no_recent_churn: Number(r[9] ?? 0),
      signal_zero_coverage: Number(r[10] ?? 0),
      signal_isolated_community: Number(r[11] ?? 0),
      is_ignored: Number(r[12] ?? 0),
      ignore_reason: asText(r[13] ?? ''),
      cross_pkg_in_count: Number(r[14] ?? 0),
      external_consumer_pkgs: Number(r[15] ?? 0),
      total_in_count: Number(r[16] ?? 0),
      is_barrel: Number(r[17] ?? 0),
      centrality_score: Number(r[18] ?? 0),
      analyzed_at: asText(r[19] ?? ''),
      line_count: Number(r[20] ?? 0),
      cyclomatic_complexity_max: Number(r[21] ?? 0),
      category: parseCategory(r[22]),
      repo_id: Number(r[23] ?? 0),
    }));
  }

  getAllReleaseFileAnalysis(): Array<{
    release_id: number; release_tag: string; repo_name: string; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string;
    cross_pkg_in_count: number; external_consumer_pkgs: number; total_in_count: number; is_barrel: number; centrality_score: number;
    analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
    category: string;
  }> {
    const db = this.ensureDb();
    const result = db.exec(
      // flip 後は release_id FK。Supabase 同期は release_tag キーのため releases へ JOIN する。
      // Phase H-5: rfa.repo_name 列は撤去済。SyncService が Supabase trail_release_file_analysis へ運ぶ
      // (release_tag, repo_name, file_path) PK 契約を維持するため、release_tag は releases.tag を、
      // repo_name は releases.repo_id → repos を LEFT JOIN して COALESCE(repo.repo_name, '') を射影する
      // (repo_id 未解決/sentinel は '' = 旧 repo_name='' と等価・結果キーは不変)。
      `SELECT r.tag, COALESCE(repo.repo_name, '') AS repo_name, rfa.file_path, rfa.importance_score, rfa.fan_in_total, rfa.cognitive_complexity_max, rfa.function_count,
              rfa.dead_code_score, rfa.signal_orphan, rfa.signal_fan_in_zero, rfa.signal_no_recent_churn,
              rfa.signal_zero_coverage, rfa.signal_isolated_community, rfa.is_ignored, rfa.ignore_reason,
              rfa.cross_pkg_in_count, rfa.external_consumer_pkgs, rfa.total_in_count, rfa.is_barrel, rfa.centrality_score,
              rfa.analyzed_at, rfa.line_count, rfa.cyclomatic_complexity_max, rfa.category, r.release_id
       FROM release_file_analysis rfa
       JOIN releases r ON r.release_id = rfa.release_id
       LEFT JOIN repos repo ON repo.repo_id = r.repo_id`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: asText(r[0] ?? ''),
      repo_name: asText(r[1] ?? ''),
      file_path: asText(r[2] ?? ''),
      importance_score: Number(r[3] ?? 0),
      fan_in_total: Number(r[4] ?? 0),
      cognitive_complexity_max: Number(r[5] ?? 0),
      function_count: Number(r[6] ?? 0),
      dead_code_score: Number(r[7] ?? 0),
      signal_orphan: Number(r[8] ?? 0),
      signal_fan_in_zero: Number(r[9] ?? 0),
      signal_no_recent_churn: Number(r[10] ?? 0),
      signal_zero_coverage: Number(r[11] ?? 0),
      signal_isolated_community: Number(r[12] ?? 0),
      is_ignored: Number(r[13] ?? 0),
      ignore_reason: asText(r[14] ?? ''),
      cross_pkg_in_count: Number(r[15] ?? 0),
      external_consumer_pkgs: Number(r[16] ?? 0),
      total_in_count: Number(r[17] ?? 0),
      is_barrel: Number(r[18] ?? 0),
      centrality_score: Number(r[19] ?? 0),
      analyzed_at: asText(r[20] ?? ''),
      line_count: Number(r[21] ?? 0),
      cyclomatic_complexity_max: Number(r[22] ?? 0),
      category: parseCategory(r[23]),
      release_id: Number(r[24] ?? 0),
    }));
  }

  getAllCurrentFunctionAnalysis(): Array<{
    repo_id: number; repo_name: string; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number;
    fan_out: number; distinct_callees: number; function_role: string;
    analyzed_at: string;
    cyclomatic_complexity: number;
  }> {
    const db = this.ensureDb();
    // Phase H-3: repo_name は current_function_analysis に無い。repos を LEFT JOIN して射影する (結果キーは不変)。
    // 未解決 repo_id (0/NULL) 行も同期から落とさないため LEFT JOIN + COALESCE(rp.repo_name, '')。
    const result = db.exec(
      `SELECT COALESCE(rp.repo_name, '') AS repo_name, fn.file_path, fn.function_name, fn.start_line,
              fn.end_line, fn.language, fn.fan_in, fn.cognitive_complexity,
              fn.data_mutation_score, fn.side_effect_score, fn.line_count,
              fn.importance_score, fn.signal_fan_in_zero,
              fn.fan_out, fn.distinct_callees, fn.function_role,
              fn.analyzed_at,
              fn.cyclomatic_complexity, fn.repo_id
       FROM current_function_analysis fn LEFT JOIN repos rp ON rp.repo_id = fn.repo_id`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      repo_name: asText(r[0] ?? ''),
      file_path: asText(r[1] ?? ''),
      function_name: asText(r[2] ?? ''),
      start_line: Number(r[3] ?? 0),
      end_line: Number(r[4] ?? 0),
      language: asText(r[5] ?? ''),
      fan_in: Number(r[6] ?? 0),
      cognitive_complexity: Number(r[7] ?? 0),
      data_mutation_score: Number(r[8] ?? 0),
      side_effect_score: Number(r[9] ?? 0),
      line_count: Number(r[10] ?? 0),
      importance_score: Number(r[11] ?? 0),
      signal_fan_in_zero: Number(r[12] ?? 0),
      fan_out: Number(r[13] ?? 0),
      distinct_callees: Number(r[14] ?? 0),
      function_role: asText(r[15] ?? 'peripheral'),
      analyzed_at: asText(r[16] ?? ''),
      cyclomatic_complexity: Number(r[17] ?? 0),
      repo_id: Number(r[18] ?? 0),
    }));
  }

  getAllReleaseFunctionAnalysis(): Array<{
    release_id: number; release_tag: string; repo_name: string; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number;
    fan_out: number; distinct_callees: number; function_role: string;
    analyzed_at: string;
    cyclomatic_complexity: number;
  }> {
    const db = this.ensureDb();
    const result = db.exec(
      // flip 後は release_id FK。Supabase 同期は release_tag キーのため releases へ JOIN する。
      // Phase H-5: rfa.repo_name 列は撤去済。SyncService が Supabase trail_release_function_analysis へ運ぶ
      // (release_tag, repo_name, file_path, function_name, start_line) PK 契約を維持するため、release_tag は
      // releases.tag を、repo_name は releases.repo_id → repos を LEFT JOIN して射影する (結果キーは不変)。
      `SELECT r.tag, COALESCE(repo.repo_name, '') AS repo_name, rfa.file_path, rfa.function_name, rfa.start_line,
              rfa.end_line, rfa.language, rfa.fan_in, rfa.cognitive_complexity,
              rfa.data_mutation_score, rfa.side_effect_score, rfa.line_count,
              rfa.importance_score, rfa.signal_fan_in_zero,
              rfa.fan_out, rfa.distinct_callees, rfa.function_role,
              rfa.analyzed_at,
              rfa.cyclomatic_complexity, r.release_id
       FROM release_function_analysis rfa
       JOIN releases r ON r.release_id = rfa.release_id
       LEFT JOIN repos repo ON repo.repo_id = r.repo_id`,
    );
    const values = result[0]?.values ?? [];
    return values.map((r) => ({
      release_tag: asText(r[0] ?? ''),
      repo_name: asText(r[1] ?? ''),
      file_path: asText(r[2] ?? ''),
      function_name: asText(r[3] ?? ''),
      start_line: Number(r[4] ?? 0),
      end_line: Number(r[5] ?? 0),
      language: asText(r[6] ?? ''),
      fan_in: Number(r[7] ?? 0),
      cognitive_complexity: Number(r[8] ?? 0),
      data_mutation_score: Number(r[9] ?? 0),
      side_effect_score: Number(r[10] ?? 0),
      line_count: Number(r[11] ?? 0),
      importance_score: Number(r[12] ?? 0),
      signal_fan_in_zero: Number(r[13] ?? 0),
      fan_out: Number(r[14] ?? 0),
      distinct_callees: Number(r[15] ?? 0),
      function_role: asText(r[16] ?? 'peripheral'),
      analyzed_at: asText(r[17] ?? ''),
      cyclomatic_complexity: Number(r[18] ?? 0),
      release_id: Number(r[19] ?? 0),
    }));
  }

  getCoverageSummary(releaseTag: string): ReleaseCoverageRow[] {
    const db = this.ensureDb();
    const releaseId = this.releaseIdForTag(db, releaseTag);
    if (releaseId == null) return [];
    const result = db.exec(
      `SELECT package, file_path,
              lines_total, lines_covered, lines_pct,
              statements_total, statements_covered, statements_pct,
              functions_total, functions_covered, functions_pct,
              branches_total, branches_covered, branches_pct
         FROM release_coverage WHERE release_id = ? AND file_path = '__total__'`,
      [releaseId],
    );
    if (!result[0]?.values) return [];
    const toNum = (v: unknown): number => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
    return result[0].values.map((r) => ({
      release_tag: releaseTag,
      package: asText(r[0] ?? ''),
      file_path: asText(r[1] ?? ''),
      lines_total: toNum(r[2]),
      lines_covered: toNum(r[3]),
      lines_pct: toNum(r[4]),
      statements_total: toNum(r[5]),
      statements_covered: toNum(r[6]),
      statements_pct: toNum(r[7]),
      functions_total: toNum(r[8]),
      functions_covered: toNum(r[9]),
      functions_pct: toNum(r[10]),
      branches_total: toNum(r[11]),
      branches_covered: toNum(r[12]),
      branches_pct: toNum(r[13]),
    }));
  }

  // ---------------------------------------------------------------------------
  //  Quality Metrics
  // ---------------------------------------------------------------------------

  /** Two-scan user↔assistant token attribution for getQualityMetricsInputs. */
  private queryMessagesForQuality(
    db: Database,
    f: string,
    t: string,
  ): Array<{ uuid: string; created_at: string; role: string; type: string; session_id: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; cost_usd: number }> {
    const userRes = db.exec(
      `SELECT uuid, session_id, timestamp, type
       FROM messages
       WHERE type = 'user' AND timestamp >= ? AND timestamp <= ?`,
      [f, t],
    );
    if (!userRes[0]) return [];

    type UserRow = { uuid: string; session_id: string; timestamp: string; type: string };
    const userMessages: UserRow[] = userRes[0].values.map((row) => ({
      uuid: row[0] as string,
      session_id: row[1] as string,
      timestamp: row[2] as string,
      type: row[3] as string,
    }));

    const usersBySession = new Map<string, UserRow[]>();
    for (const u of userMessages) {
      const arr = usersBySession.get(u.session_id);
      if (arr) arr.push(u);
      else usersBySession.set(u.session_id, [u]);
    }
    for (const arr of usersBySession.values()) {
      arr.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    type Tokens = { input: number; output: number; cr: number; cc: number; cost: number };
    const tokensByUserUuid = new Map<string, Tokens>();
    for (const u of userMessages) tokensByUserUuid.set(u.uuid, { input: 0, output: 0, cr: 0, cc: 0, cost: 0 });

    const asstRes = db.exec(
      `SELECT m.session_id, s.source, m.timestamp, m.input_tokens, m.output_tokens, m.cache_read_tokens, m.cache_creation_tokens, m.model
       FROM messages m
       INNER JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant' AND m.timestamp >= ? AND m.timestamp <= ?`,
      [f, t],
    );
    if (asstRes[0]) this.attributeAssistantTokens(asstRes[0].values, usersBySession, tokensByUserUuid);

    return userMessages.map((u) => {
      const tokens = tokensByUserUuid.get(u.uuid) ?? { input: 0, output: 0, cr: 0, cc: 0, cost: 0 };
      return {
        uuid: u.uuid, created_at: u.timestamp, role: u.type, type: 'text', session_id: u.session_id,
        input_tokens: tokens.input, output_tokens: tokens.output,
        cache_read_tokens: tokens.cr, cache_creation_tokens: tokens.cc, cost_usd: tokens.cost,
      };
    });
  }

  /** Attribute assistant message tokens to the preceding user message via binary search. */
  private attributeAssistantTokens(
    asstRows: readonly unknown[][],
    usersBySession: Map<string, Array<{ uuid: string; timestamp: string }>>,
    tokensByUserUuid: Map<string, { input: number; output: number; cr: number; cc: number; cost: number }>,
  ): void {
    for (const row of asstRows) {
      const sessionId = row[0] as string;
      const source = row[1] as string;
      const asstTs = row[2] as string;
      const sessionUsers = usersBySession.get(sessionId);
      if (!sessionUsers) continue;

      let lo = 0;
      let hi = sessionUsers.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (sessionUsers[mid].timestamp <= asstTs) { idx = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      if (idx === -1) continue;

      const tokens = tokensByUserUuid.get(sessionUsers[idx].uuid);
      if (!tokens) continue;
      const inputToks = (row[3] as number) ?? 0;
      const outputToks = (row[4] as number) ?? 0;
      const crToks = (row[5] as number) ?? 0;
      const ccToks = (row[6] as number) ?? 0;
      const model = (row[7] as string | null) ?? '';
      tokens.input += inputToks;
      tokens.output += outputToks;
      tokens.cr += crToks;
      tokens.cc += ccToks;
      tokens.cost += calculateCost(model, {
        inputTokens: inputToks, outputTokens: outputToks,
        cacheReadTokens: crToks, cacheCreationTokens: ccToks,
      }, source as PricingSource);
    }
  }

  getQualityMetricsInputs(from: string, to: string, prevFrom: string, prevTo: string): {
    releases: Array<{ id: string; tag_date: string; commit_hashes: string[]; fix_count: number }>;
    messages: Array<{ uuid: string; created_at: string; role: string; type: string; session_id: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; cost_usd: number }>;
    messageCommits: Array<{ message_uuid: string; commit_hash: string; detected_at: string; match_confidence: string }>;
    commits: Array<{ hash: string; subject: string; committed_at: string; is_ai_assisted: boolean; files: string[]; lines_added: number; lines_deleted: number; session_id: string }>;
    previousReleases: Array<{ id: string; tag_date: string; commit_hashes: string[]; fix_count: number }>;
    previousMessages: Array<{ uuid: string; created_at: string; role: string; type: string; session_id: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; cost_usd: number }>;
    previousMessageCommits: Array<{ message_uuid: string; commit_hash: string; detected_at: string; match_confidence: string }>;
    previousCommits: Array<{ hash: string; subject: string; committed_at: string; is_ai_assisted: boolean; files: string[]; lines_added: number; lines_deleted: number }>;
  } {
    const db = this.ensureDb();

    const queryReleases = (f: string, t: string) => {
      const res = db.exec(
        `SELECT tag, released_at, fix_count FROM releases WHERE released_at >= ? AND released_at <= ?`,
        [f, t],
      );
      if (!res[0]) return [];
      return res[0].values.map((row) => ({
        id: row[0] as string,
        tag_date: row[1] as string,
        commit_hashes: [] as string[],
        fix_count: (row[2] as number) ?? 0,
      }));
    };

    const queryMessages = (f: string, t: string) => this.queryMessagesForQuality(db, f, t);

    const queryMessageCommits = (f: string, t: string) => {
      const res = db.exec(
        `SELECT mc.message_uuid, mc.commit_hash, mc.detected_at, mc.match_confidence
         FROM message_commits mc
         INNER JOIN messages m ON mc.message_uuid = m.uuid
         WHERE m.timestamp >= ? AND m.timestamp <= ?
           AND mc.match_confidence IN ('realtime', 'high', 'medium')`,
        [f, t],
      );
      if (!res[0]) return [];
      return res[0].values.map((row) => ({
        message_uuid: row[0] as string,
        commit_hash: row[1] as string,
        detected_at: row[2] as string,
        match_confidence: row[3] as string,
      }));
    };

    // AI First-Try Success Rate は fix コミットを 168h 先まで、MTTR は障害混入コミットを
    // 168h 前まで見る必要があるため、commits の取得範囲を fix 検出ウィンドウぶん両側へ拡張する。
    // 範囲内フィルタは各 compute 関数側で行うため、既存指標には影響しない。
    const FIX_WINDOW_MS = 168 * 60 * 60 * 1000;
    const extendedFrom = new Date(new Date(from).getTime() - FIX_WINDOW_MS).toISOString();
    const extendedTo = new Date(new Date(to).getTime() + FIX_WINDOW_MS).toISOString();
    const extendedPrevFrom = new Date(new Date(prevFrom).getTime() - FIX_WINDOW_MS).toISOString();
    const extendedPrevTo = new Date(new Date(prevTo).getTime() + FIX_WINDOW_MS).toISOString();

    const queryCommits = (f: string, t: string) => {
      const res = db.exec(
        `SELECT commit_hash, commit_message, committed_at, is_ai_assisted,
                MAX(lines_added) as lines_added, MAX(lines_deleted) as lines_deleted,
                MIN(session_id) as session_id
         FROM session_commits
         WHERE committed_at >= ? AND committed_at <= ?
         GROUP BY commit_hash`,
        [f, t],
      );
      if (!res[0]) return [];
      const commits = res[0].values.map((row) => ({
        hash: row[0] as string,
        subject: (row[1] as string ?? '').split('\n')[0],
        committed_at: row[2] as string,
        is_ai_assisted: (row[3] as number) === 1,
        files: [] as string[],
        lines_added: (row[4] as number) ?? 0,
        lines_deleted: (row[5] as number) ?? 0,
        session_id: row[6] as string,
      }));
      if (commits.length === 0) return commits;

      const placeholders = commits.map(() => '?').join(',');
      const filesRes = db.exec(
        `SELECT commit_hash, file_path FROM commit_files WHERE commit_hash IN (${placeholders})`,
        commits.map((c) => c.hash),
      );
      if (filesRes[0]) {
        const byHash = new Map<string, string[]>();
        for (const row of filesRes[0].values) {
          const hash = row[0] as string;
          const path = row[1] as string;
          const list = byHash.get(hash);
          if (list) list.push(path);
          else byHash.set(hash, [path]);
        }
        for (const c of commits) {
          c.files = byHash.get(c.hash) ?? [];
        }
      }
      return commits;
    };

    return {
      releases: queryReleases(from, to),
      messages: queryMessages(from, to),
      messageCommits: queryMessageCommits(from, to),
      commits: queryCommits(extendedFrom, extendedTo),
      previousReleases: queryReleases(prevFrom, prevTo),
      previousMessages: queryMessages(prevFrom, prevTo),
      previousMessageCommits: queryMessageCommits(prevFrom, prevTo),
      previousCommits: queryCommits(extendedPrevFrom, extendedPrevTo),
    };
  }

  getCurrentFeatureMatrix(): FeatureMatrix | null {
    const db = this.ensureDb();
    const cols = db.exec('PRAGMA table_info(current_code_graph_communities)');
    const colNames = new Set((cols[0]?.values ?? []).map((r) => String(r[1])));
    if (!colNames.has('mappings_json')) return null;

    const result = db.exec(
      "SELECT community_id, name, label, mappings_json FROM current_code_graph_communities WHERE name IS NOT NULL AND name != '' AND mappings_json IS NOT NULL ORDER BY community_id",
    );
    const rows = (result[0]?.values ?? []).map((row) => ({
      community_id: Number(row[0]),
      name: String(row[1]),
      label: String(row[2]),
      mappings_json: row[3] == null ? null : asText(row[3]),
    }));

    return buildFeatureMatrixFromCommunities(rows);
  }

  // ---------------------------------------------------------------------------
  //  Hotspot / Activity Map (trail-time-axis-requirements 3.2)
  // ---------------------------------------------------------------------------

  fetchHotspotRows(params: {
    from: string;
    to: string;
    granularity: 'commit' | 'session';
    repo?: string;
  }): ReadonlyArray<{ readonly filePath: string; readonly churn: number }> {
    const db = this.ensureDb();
    const { from, to, granularity, repo } = params;

    const sql = repo
      ? HOTSPOT_SQL_BY_GRANULARITY_WITH_REPO[granularity]
      : HOTSPOT_SQL_BY_GRANULARITY[granularity];
    // Phase H-4: sessions.repo_name 列は撤去済。WITH_REPO SQL は s.repo_id = ? を使うため repo_id を渡す。
    // 純粋 read のため repoIdForNameReadonly で解決 (未登録は -1 → 空結果)。
    const args: (string | number)[] = repo ? [from, to, this.repoIdForNameReadonly(repo)] : [from, to];
    const res = db.exec(sql, args);
    if (!res.length) return [];
    return res[0].values.map((row) => ({
      filePath: String(row[0]),
      churn: Number(row[1]),
    }));
  }

  fetchActivityHeatmapRows(params: {
    from: string;
    to: string;
    mode: 'session-file' | 'subagent-file';
    rowLimit?: number;
  }): ReadonlyArray<{
    readonly rowId: string;
    readonly rowLabel: string;
    readonly filePath: string;
    readonly count: number;
  }> {
    const db = this.ensureDb();
    const { from, to, mode, rowLimit = 200 } = params;
    if (mode === 'session-file') {
      const sql = `
        SELECT m.session_id AS rowId,
               COALESCE(MAX(s.slug), m.session_id) AS slug,
               COALESCE(MAX(DATE(m.timestamp)), '') AS sessionDate,
               mtc.file_path AS filePath,
               COUNT(*) AS cnt
        FROM message_tool_calls mtc
        INNER JOIN messages m ON mtc.message_uuid = m.uuid
        LEFT JOIN sessions s ON m.session_id = s.id
        WHERE m.timestamp >= ? AND m.timestamp <= ?
          AND mtc.tool_name IN ('Edit', 'Write', 'NotebookEdit')
          AND mtc.file_path IS NOT NULL
        GROUP BY m.session_id, mtc.file_path
        ORDER BY cnt DESC
      `;
      const res = db.exec(sql, [from, to]);
      if (!res.length) return [];
      const rowsAll = res[0].values.map((row) => {
        const sessionId = String(row[0]);
        const slug = asText(row[1] ?? sessionId);
        const date = asText(row[2] ?? '');
        const shortHash = sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
        const label = date ? `${slug || shortHash} (${date})` : (slug || shortHash);
        return {
          rowId: sessionId,
          rowLabel: label,
          filePath: String(row[3]),
          count: Number(row[4]),
        };
      });
      return limitToTopRowKeys(rowsAll, rowLimit);
    }
    const activityRows = this.fetchSubagentActivityRows({
      from,
      to,
      toolNames: SESSION_COUPLING_EDIT_TOOLS,
    });
    const counts = new Map<string, { rowId: string; filePath: string; count: number }>();
    for (const r of activityRows) {
      if (!r.subagentType || !r.filePath) continue;
      const key = `${r.subagentType} ${r.filePath}`;
      const cur = counts.get(key);
      if (cur) {
        cur.count++;
      } else {
        counts.set(key, { rowId: r.subagentType, filePath: r.filePath, count: 1 });
      }
    }
    const rowsAll = Array.from(counts.values())
      .map(({ rowId, filePath, count }) => ({ rowId, rowLabel: rowId, filePath, count }))
      .sort((a, b) => b.count - a.count);
    return limitToTopRowKeys(rowsAll, rowLimit);
  }

  /** Build a file-path normalizer from project root candidates (strips absolute prefix and worktree prefix). */
  private buildFilePathNormalizer(projectRoots: string[]): (raw: string) => string | null {
    const sorted = [...projectRoots].sort((a, b) => a.length - b.length);
    return (raw: string): string | null => {
      if (!raw) return null;
      if (!raw.startsWith('/')) return stripWorktreePrefix(raw);
      for (const root of sorted) {
        if (raw === root) continue;
        const prefix = root.endsWith('/') ? root : `${root}/`;
        if (raw.startsWith(prefix)) return stripWorktreePrefix(raw.slice(prefix.length));
      }
      return null;
    };
  }

  fetchActivityTrendRows(params: {
    from: string;
    to: string;
    granularity: ActivityTrendGranularity;
    sessionMode?: 'read' | 'write';
    filePathsIn: ReadonlyArray<string>;
  }): ReadonlyArray<{
    readonly committedAt: string;
    readonly filePath: string;
    readonly subagentType?: string | null;
  }> {
    const db = this.ensureDb();
    const { from, to, granularity, filePathsIn, sessionMode = 'write' } = params;
    if (filePathsIn.length === 0) return [];

    const useTempTable = filePathsIn.length > 900;
    if (useTempTable) {
      db.run('DROP TABLE IF EXISTS _hotspot_paths');
      db.run('CREATE TEMP TABLE _hotspot_paths (file_path TEXT PRIMARY KEY)');
      const stmt = db.prepare('INSERT OR IGNORE INTO _hotspot_paths VALUES (?)');
      try {
        for (const p of filePathsIn) stmt.run([p]);
      } finally {
        stmt.free();
      }
    }

    const inClause = useTempTable
      ? `(SELECT file_path FROM _hotspot_paths)`
      : `(${filePathsIn.map(() => '?').join(',')})`;

    if (granularity === 'subagent') {
      if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
      const allowed = new Set(filePathsIn);
      return this.fetchSubagentActivityRows({ from, to, toolNames: SESSION_COUPLING_EDIT_TOOLS })
        .filter((r) => allowed.has(r.filePath))
        .map((r) => ({ committedAt: r.committedAt, filePath: r.filePath, subagentType: r.subagentType }));
    }

    if (granularity === 'defect') {
      const sql = `
        SELECT sc.committed_at AS committedAt,
               MIN(cf.file_path) AS filePath,
               NULL AS subagentType
        FROM session_commits sc
        INNER JOIN commit_files cf ON cf.commit_hash = sc.commit_hash
        WHERE sc.committed_at >= ? AND sc.committed_at <= ?
          AND LOWER(sc.commit_message) GLOB 'fix[:(]*'
          AND cf.file_path IN ${inClause}
        GROUP BY sc.commit_hash
        ORDER BY sc.committed_at
      `;
      const bindings = useTempTable ? [from, to] : [from, to, ...filePathsIn];
      const res = db.exec(sql, bindings);
      if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
      if (!res.length) return [];
      return res[0].values.map((row) => ({
        committedAt: String(row[0]),
        filePath: String(row[1]),
        subagentType: row[2] == null ? null : asText(row[2]),
      }));
    }

    if (granularity === 'commit') {
      const sql = `
        SELECT sc.committed_at AS committedAt, cf.file_path AS filePath, NULL AS subagentType
        FROM commit_files cf
        INNER JOIN session_commits sc ON cf.commit_hash = sc.commit_hash
        WHERE sc.committed_at >= ? AND sc.committed_at <= ?
          AND cf.file_path IN ${inClause}
        ORDER BY sc.committed_at
      `;
      const bindings: DbScalar[] = useTempTable ? [from, to] : [from, to, ...filePathsIn];
      const res = db.exec(sql, bindings);
      if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
      if (!res.length) return [];
      return res[0].values.map((row) => ({
        committedAt: String(row[0]),
        filePath: String(row[1]),
        subagentType: row[2] == null ? null : asText(row[2]),
      }));
    }
    return this.fetchActivityTrendSessionRows(db, { from, to, sessionMode, filePathsIn, useTempTable });
  }

  private fetchActivityTrendSessionRows(
    db: Database,
    params: { from: string; to: string; sessionMode: 'read' | 'write'; filePathsIn: ReadonlyArray<string>; useTempTable: boolean },
  ): ReadonlyArray<{ readonly committedAt: string; readonly filePath: string; readonly subagentType?: string | null }> {
    const { from, to, sessionMode, filePathsIn, useTempTable } = params;
    const toolNames = sessionMode === 'read' ? ACTIVITY_TREND_READ_TOOLS : SESSION_COUPLING_EDIT_TOOLS;
    const projectRootCandidates = Array.from(
      new Set(
        this.listCurrentGraphs()
          .map((g) => g.graph?.metadata?.projectRoot)
          .filter((p): p is string => typeof p === 'string' && p.length > 0),
      ),
    );
    const normalize = this.buildFilePathNormalizer(projectRootCandidates);
    const allowed = new Set(filePathsIn);
    const toolPlaceholders = toolNames.map(() => '?').join(', ');
    const sql = `
      SELECT m.timestamp AS committedAt,
             mtc.file_path AS filePath,
             m.subagent_type AS subagentType
      FROM message_tool_calls mtc
      INNER JOIN messages m ON mtc.message_uuid = m.uuid
      WHERE m.timestamp >= ? AND m.timestamp <= ?
        AND mtc.tool_name IN (${toolPlaceholders})
        AND mtc.file_path IS NOT NULL
        AND mtc.file_path != ''
      ORDER BY m.timestamp
    `;
    const bindings: DbScalar[] = [from, to, ...toolNames];
    const res = db.exec(sql, bindings);
    if (useTempTable) db.run('DROP TABLE IF EXISTS _hotspot_paths');
    if (!res.length) return [];
    return res[0].values.flatMap((row) => {
      const normalized = normalize(String(row[1]));
      if (!normalized || !allowed.has(normalized)) return [];
      return [{ committedAt: asText(row[0]), filePath: normalized, subagentType: row[2] == null ? null : asText(row[2]) }];
    });
  }
}

const HOTSPOT_SQL_BY_GRANULARITY: Record<'commit' | 'session', string> = {
  commit: `
    SELECT cf.file_path AS filePath, COUNT(DISTINCT cf.commit_hash) AS churn
    FROM commit_files cf
    INNER JOIN session_commits sc ON cf.commit_hash = sc.commit_hash
    WHERE sc.committed_at >= ? AND sc.committed_at <= ?
    GROUP BY cf.file_path
    ORDER BY churn DESC
  `,
  session: `
    SELECT mtc.file_path AS filePath, COUNT(*) AS churn
    FROM message_tool_calls mtc
    INNER JOIN messages m ON mtc.message_uuid = m.uuid
    WHERE m.timestamp >= ? AND m.timestamp <= ?
      AND mtc.tool_name IN ('Edit', 'Write', 'NotebookEdit')
      AND mtc.file_path IS NOT NULL
    GROUP BY mtc.file_path
    ORDER BY churn DESC
  `,
};

// repo フィルタ付きの hotspot SQL（params: from, to, repoId）
// Phase H-4: sessions.repo_name 列は撤去済。repo フィルタは s.repo_id = ? (呼び出し側 fetchHotspotRows が
// repoIdForName で解決した repo_id をバインド) で行う。
const HOTSPOT_SQL_BY_GRANULARITY_WITH_REPO: Record<'commit' | 'session', string> = {
  commit: `
    SELECT cf.file_path AS filePath, COUNT(DISTINCT cf.commit_hash) AS churn
    FROM commit_files cf
    INNER JOIN session_commits sc ON cf.commit_hash = sc.commit_hash
    INNER JOIN sessions s ON s.id = sc.session_id
    WHERE sc.committed_at >= ? AND sc.committed_at <= ?
      AND s.repo_id = ?
    GROUP BY cf.file_path
    ORDER BY churn DESC
  `,
  session: `
    SELECT mtc.file_path AS filePath, COUNT(*) AS churn
    FROM message_tool_calls mtc
    INNER JOIN messages m ON mtc.message_uuid = m.uuid
    INNER JOIN sessions s ON s.id = m.session_id
    WHERE m.timestamp >= ? AND m.timestamp <= ?
      AND s.repo_id = ?
      AND mtc.tool_name IN ('Edit', 'Write', 'NotebookEdit')
      AND mtc.file_path IS NOT NULL
    GROUP BY mtc.file_path
    ORDER BY churn DESC
  `,
};

function matchCodexSessionByTime(
  delegationMs: number,
  candidates: ReadonlyArray<{ readonly id: string; readonly startMs: number; readonly endMs: number }>,
): string | null {
  let bestId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const s of candidates) {
    const inside = delegationMs >= s.startMs - 5 * 60_000 && delegationMs <= s.endMs + 5 * 60_000;
    const score = Math.abs(s.startMs - delegationMs);
    if (inside && score < bestScore) {
      bestScore = score;
      bestId = s.id;
    }
  }
  if (bestId) return bestId;
  for (const s of candidates) {
    const score = Math.abs(s.startMs - delegationMs);
    if (score <= 60 * 60_000 && score < bestScore) {
      bestScore = score;
      bestId = s.id;
    }
  }
  return bestId;
}

function limitToTopRowKeys<T extends { rowId: string; count: number }>(
  rows: ReadonlyArray<T>,
  rowLimit: number,
): T[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.rowId, (totals.get(r.rowId) ?? 0) + r.count);
  }
  const topKeys = new Set(
    Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, rowLimit)
      .map(([k]) => k),
  );
  return rows.filter((r) => topKeys.has(r.rowId));
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  source?: PricingSource,
): number {
  return calculateCost(
    model,
    {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    },
    source,
  );
}

// ---------------------------------------------------------------------------
//  File utilities
// ---------------------------------------------------------------------------

/** Recursively find all .jsonl files under a directory. */
function findJsonlFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...findJsonlFiles(fullPath));
      } else if (entry.endsWith('.jsonl') && stat.isFile()) {
        results.push(fullPath);
      }
    } catch {
      // skip
    }
  }
  return results;
}
