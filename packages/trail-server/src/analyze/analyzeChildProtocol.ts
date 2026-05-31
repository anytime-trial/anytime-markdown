import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';
import type { FileCategory } from '@anytime-markdown/trail-core/classify';

/** ホスト → 子プロセス: 解析依頼（TS 経路専用） */
export interface AnalyzeChildRequest {
  readonly analysisRoot: string;
  readonly excludeRoot?: string;
  readonly tsconfigPath: string;
  /**
   * tree-sitter-python.wasm の絶対パス。バンドル環境（analyze-child.js）の Python
   * マージで必須。ホストが codeGraphService.getPythonWasmPath() から解決して渡す。
   */
  readonly pythonWasmPath?: string;
  /**
   * decision comment（WHY/RATIONALE/理由）の AST 走査を行うか。current code 解析でのみ
   * true（memory-core が trail-db 経由で読む）。release 解析では graph のみ使うため false。
   */
  readonly includeDecisionComments?: boolean;
}

/**
 * ソースから抽出した意思決定コメント 1 件。memory-core の Decision entity 化に必要な
 * 最小情報のみ持つ（DB 永続化時に repo_id / commit_sha / recorded_at を付与）。
 */
export interface DecisionComment {
  /** リポジトリルート相対パス */
  readonly filePath: string;
  /** 1-based 行番号 */
  readonly line: number;
  /** WHY/RATIONALE/理由 接頭辞を除いた本文 */
  readonly text: string;
  /** コメント直後の宣言シンボル名（file-level の場合 null） */
  readonly symbolName: string | null;
}

/**
 * 子プロセスが計算するシリアライズ可能な結果。
 * Map は JSON シリアライズのため [key, value][] にして渡す。
 */
export interface AnalyzeComputeResult {
  readonly graph: TrailGraph;
  readonly scored: ScoredFunction[];
  readonly lineCountByFile: ReadonlyArray<readonly [string, number]>;
  readonly categoryByFile?: ReadonlyArray<readonly [string, FileCategory]>;
  /** includeDecisionComments=true のとき抽出した decision comment 群（既定 undefined） */
  readonly decisionComments?: DecisionComment[];
  readonly warnings: string[];
}

/** 子 → ホスト メッセージ */
export type AnalyzeChildMessage =
  | { readonly type: 'progress'; readonly phase: string; readonly percent: number }
  | { readonly type: 'result'; readonly resultPath: string }
  | { readonly type: 'error'; readonly message: string; readonly stack?: string };

/** ホスト → 子 メッセージ */
export type AnalyzeHostMessage = { readonly type: 'analyze'; readonly request: AnalyzeChildRequest };
