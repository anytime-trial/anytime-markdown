import * as path from 'node:path';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { AnalyzeOptions } from '@anytime-markdown/trail-core/analyze';
import { AnalyzeChildRunner, type AnalyzeChildRunnerDeps } from './AnalyzeChildRunner';

/**
 * `makeChildAnalyzeFn` の依存。`AnalyzeChildRunner` へ透過するものに加え、
 * Python マージ用の wasm パスを受ける。
 */
export interface ChildAnalyzeFnDeps {
  /** tree-sitter-python.wasm の絶対パス。child の Python 分類・importance で使う。 */
  readonly pythonWasmPath?: string;
  readonly onProgress?: (phase: string, percent: number) => void;
  readonly logger?: { info(m: string): void; warn(m: string): void; error(m: string, e?: unknown): void };
  /** fork 注入（テスト用）。`AnalyzeChildRunner` へ透過。 */
  readonly fork?: AnalyzeChildRunnerDeps['fork'];
  /** SIGSEGV 時の 1 回リトライ可否（既定 true）。 */
  readonly retryOnCrash?: boolean;
}

/**
 * `analyze-child` プロセスへ fork して TS 解析を実行する `AnalyzeFunction` 互換の
 * 非同期関数を生成する。daemon は trail-core の同期 `analyze`（typescript を静的に
 * 引き込む）の代わりに本関数を注入することで、`trail-daemon.js` から typescript を
 * 排除しつつ TS 解析を analyze-child へ一本化する。
 *
 * リリース解析は TrailGraph のみ必要なため、child が返す `AnalyzeComputeResult` の
 * うち `graph` だけを取り出す（scored / lineCount / category は破棄）。
 *
 * @param analyzeChildPath 子プロセス本体 `dist/analyze-child.js` の絶対パス
 */
export function makeChildAnalyzeFn(
  analyzeChildPath: string,
  deps: ChildAnalyzeFnDeps = {},
): (options: AnalyzeOptions) => Promise<TrailGraph> {
  return async (options: AnalyzeOptions): Promise<TrailGraph> => {
    // exclude (Ignore インスタンス) はシリアライズ不可。child は excludeRoot から
    // loadAnalyzeExclude で再構築するため、tsconfig のあるディレクトリを analysisRoot /
    // excludeRoot として渡す。
    const analysisRoot = path.dirname(options.tsconfigPath);
    const runner = new AnalyzeChildRunner(analyzeChildPath, {
      fork: deps.fork,
      onProgress: deps.onProgress,
      logger: deps.logger,
      retryOnCrash: deps.retryOnCrash,
    });
    const result = await runner.run({
      analysisRoot,
      excludeRoot: analysisRoot,
      tsconfigPath: options.tsconfigPath,
      pythonWasmPath: deps.pythonWasmPath,
    });
    return result.graph;
  };
}
