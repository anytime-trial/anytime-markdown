import type { MemoryLogger } from '../logger';
import type { RunReason } from '../runner/types';

/**
 * Layer 1 (Sources) が発火するイベント。
 *
 * - `jsonl_session_discovered`: Claude Code / Codex の jsonl セッションファイルを 1 件発見
 * - `jsonl_message`: 個別メッセージ単位の event (Step 2b 以降の SessionImporter で消費)
 * - `git_commit`: gitRoot 内の 1 コミット
 * - `git_tag`: gitRoot 内の 1 タグ
 * - `coverage_report`: 1 package の coverage-summary.json
 * - `meta_json`: subagent meta.json 1 件
 * - `github_pr_review`: GitHub PR review 1 件 (Step 4b の新ソース参照実装)
 */
export type SourceEvent =
  | {
      kind: 'jsonl_session_discovered';
      sessionId: string;
      mainFile: string;
      subagentFiles: readonly string[];
      repoName: string;
      source: 'claude_code' | 'codex';
      fileSize: number;
      hasMessages: boolean;
      hasUsableCostData: boolean;
    }
  | {
      kind: 'jsonl_message';
      sessionId: string;
      uuid: string;
      timestamp: string;
      type: 'user' | 'assistant' | 'system';
    }
  | {
      kind: 'git_commit';
      repo: string;
      hash: string;
      committedAt: string;
      author: string;
      message: string;
    }
  | {
      kind: 'git_tag';
      repo: string;
      tag: string;
      commitHash: string;
    }
  | {
      kind: 'coverage_report';
      pkg: string;
      filePath: string;
      gitRoot: string;
    }
  | {
      kind: 'meta_json';
      sessionId: string;
      agentId: string;
      agentType: string;
      filePath: string;
    }
  | {
      // GitHub PR review 1 件 (Step 4b)。新ソース追加が既存 analyzer / DDL 無変更で
      // 行えることを実証する参照実装。トークンなし環境では Ingester が emit しない。
      kind: 'github_pr_review';
      /** 'owner/name' 形式 */
      repo: string;
      prNumber: number;
      /** GitHub REST の review id (グローバル一意)。文字列で保持 */
      reviewId: string;
      author: string;
      state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
      /** review 提出日時 (ISO 8601 + Z) */
      submittedAt: string;
      /** review 本文 (空文字可) */
      body: string;
      /** 冪等判定用の body + comments ハッシュ */
      bodyHash: string;
      /** review に紐づく行コメント */
      comments: readonly {
        readonly path: string;
        readonly line: number | null;
        readonly body: string;
      }[];
    };

/**
 * Layer 2 (Primary) 以降が発火するイベント。
 *
 * - `session_imported`:        SessionImporter が import に成功した
 * - `session_skipped`:         SessionImporter が import をスキップした
 * - `commit_resolved`:         CommitResolver が session × repo の commit 紐付けを完了
 * - `release_resolved`:        ReleaseResolver が release tag を 1 件解決
 * - `code_graph_built`:        release tag に対する code graph 構築完了
 * - `current_code_graph_built`: HEAD ベースの current code graph 構築完了
 * - `pr_review_imported`:      PrReviewImporter が GitHub PR review 1 件を trail.db へ取込完了 (Step 4c)
 * - `wave_start`:              Wave の開始 (tier analyzer 実行前に emit。Layer 3 の発火契機)
 * - `wave_complete`:           Wave の全 analyzer 実行完了 (barrier)
 * - `wave_skipped`:            Wave がスキップされた (例: memory-core が disabled)
 */
export type DerivedEvent =
  | { kind: 'session_imported'; sessionId: string; messageCount: number; repoName: string }
  | {
      kind: 'session_skipped';
      sessionId: string;
      reason: 'file_unchanged' | 'codex_outside_gitroot';
    }
  | {
      kind: 'commit_resolved';
      sessionId: string;
      repoName: string;
      hashes: readonly string[];
    }
  | { kind: 'release_resolved'; tag: string; releasedAt: string }
  | { kind: 'code_graph_built'; releaseTag: string; repoName: string; communities: number }
  | {
      kind: 'current_code_graph_built';
      repoName: string;
      communities: number;
      nodes: number;
      edges: number;
    }
  | {
      // PrReviewImporter (Step 4c) が GitHub PR review 1 件を trail.db に取込完了。
      // PrReviewFindingAnalyzer の発火契機。
      kind: 'pr_review_imported';
      repo: string;
      prNumber: number;
      reviewId: string;
      commentCount: number;
    }
  | { kind: 'wave_start'; wave: 'sources' | 'primary' | 'memory' | 'derived' }
  | { kind: 'wave_complete'; wave: 'sources' | 'primary' | 'memory' | 'derived' }
  | {
      kind: 'wave_skipped';
      wave: 'sources' | 'primary' | 'memory' | 'derived';
      reason: string;
    };

/**
 * LEP の全 event union。SourceEvent + DerivedEvent を直接 union したもの。
 *
 * memory analyzer 専用 event (review_finding_extracted 等) は Step 3 で追加する。
 */
export type AnalyzerEvent = SourceEvent | DerivedEvent;

/**
 * LEP 全体の実行 stage。「どの Wave まで実行するか」を表す (設計書 9 章)。
 *
 * - `disabled`:        何も実行しない (デフォルト)
 * - `sources`:         Wave 1 のみ (取込確認・デバッグ)
 * - `primary`:         Wave 1+2 (旧 importAll 相当)
 * - `memory`:          Wave 3 のみ (要 primary 済データ。memory-core 単体再解析)
 * - `primary+memory`:  Wave 1+2+3 (旧 analyzeAll enabled=true 相当)
 * - `all`:             Wave 1+2+3+4 (aggregator 含む。本 Step では Wave 4 は空)
 */
export type LepStage =
  | 'disabled'
  | 'sources'
  | 'primary'
  | 'memory'
  | 'primary+memory'
  | 'all';

/** {@link LepStage} の全列挙値。バリデーション (lep.json の `stage` 検証) で使う。 */
export const LEP_STAGES: readonly LepStage[] = [
  'disabled',
  'sources',
  'primary',
  'memory',
  'primary+memory',
  'all',
] as const;

/**
 * EventBus 発行口。Analyzer は `ctx.bus.publish()` でイベントを発火する。
 *
 * `Promise<void>` を返す async 契約とし、subscriber の onEvent を await
 * できるようにする (publisher 側でエラーや完走を待ち合わせ可能)。
 */
export interface EventBusPublisher {
  publish(e: AnalyzerEvent): Promise<void>;
}

/**
 * 1 回の runOnce で全 analyzer に渡される実行コンテキスト。
 */
export interface AnalyzerContext {
  /** この run の一意 ID (UUID v4 想定) */
  readonly runId: string;
  /** runOnce を起動した契機 (RunReason: manual / startup / periodic / import) */
  readonly reason: RunReason;
  /** ログ出力口 (analyzer ID プレフィックスは呼び出し側で付与) */
  readonly logger: MemoryLogger;
  /** イベント発行口。新規 event を pub する場合に使用 */
  readonly bus: EventBusPublisher;
}

/**
 * LEP の最小 Analyzer インターフェイス。
 *
 * - `tier=1` (sources): JSONL / git log 等の生データ ingest
 * - `tier=2` (primary): codegraph / commit resolver 等の primary 派生
 * - `tier=3` (memory):  memory-core ingest pipeline
 * - `tier=4` (derived): 集計・サマリ等
 *
 * - `subscribes`: 受信する event 種別
 * - `emits`:      発火する event 種別 (任意, ドキュメント用途)
 * - `inputMode`:  'event' (subscribes 経由で event 駆動) or 'self-read' (自前で DB / FS を読む)
 * - `onRunStart`: 1 run の冒頭で 1 回呼ばれる (Wave の handshake 用)
 * - `onRunEnd`:   tier loop で 1 回呼ばれる (tier 順次実行)
 * - `onEvent`:    subscribes のいずれかが publish された時に呼ばれる
 */
export interface Analyzer {
  readonly id: string;
  readonly tier: 1 | 2 | 3 | 4;
  readonly subscribes: readonly AnalyzerEvent['kind'][];
  readonly emits?: readonly AnalyzerEvent['kind'][];
  /**
   * 入力モード:
   * - `'event'`:     subscribes に列挙した event を bus 経由で受信して処理
   * - `'self-read'`: 自前で DB / ファイルシステムを読み、event を駆動材料に使わない
   *
   * 省略時は `'event'` 扱い。`code graph` 系のような ingester を持たない analyzer は
   * `'self-read'` を宣言して event 駆動と分離する。
   */
  readonly inputMode?: 'event' | 'self-read';

  /**
   * 同一 Wave (tier) 内で、この analyzer より**前に**完了している必要がある
   * analyzer の id。Wave 3 (memory) の実行順制御に使う (例: Drift は全 content
   * analyzer の後、EmbeddingBackfill は全 analyzer の後)。`topoSortByDependsOn`
   * がこの宣言からトポロジカル順序を導く。
   */
  readonly dependsOn?: readonly string[];

  /**
   * この analyzer が必要とする LLM 機能の宣言 (設計書 12.3)。未宣言 = LLM 不要
   * (Ollama 不在でも実行可能。例: Code / BugHistory / Drift)。Wave 3 開始前の
   * Pre-flight ヘルスチェックでこの宣言を満たさない analyzer のみ skip する。
   */
  readonly requiresLlm?: {
    chat?: { provider: 'ollama' | 'anthropic'; model: string };
    embedding?: { provider: 'ollama'; model: string };
  };

  onRunStart?(ctx: AnalyzerContext): Promise<void>;
  onRunEnd?(ctx: AnalyzerContext): Promise<void>;
  onEvent?(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void>;
}
