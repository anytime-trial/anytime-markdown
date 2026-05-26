import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';
import type { FileCategory } from '@anytime-markdown/trail-core/classify';

/** ホスト → 子プロセス: 解析依頼（TS 経路専用） */
export interface AnalyzeChildRequest {
  readonly analysisRoot: string;
  readonly excludeRoot?: string;
  readonly tsconfigPath: string;
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
  readonly warnings: string[];
}

/** 子 → ホスト メッセージ */
export type AnalyzeChildMessage =
  | { readonly type: 'progress'; readonly phase: string; readonly percent: number }
  | { readonly type: 'result'; readonly resultPath: string }
  | { readonly type: 'error'; readonly message: string; readonly stack?: string };

/** ホスト → 子 メッセージ */
export type AnalyzeHostMessage = { readonly type: 'analyze'; readonly request: AnalyzeChildRequest };
