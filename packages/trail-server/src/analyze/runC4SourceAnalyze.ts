import { fork as nodeFork, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AnalyzeChildMessage,
  C4SourceAnalyzeRequest,
  C4SourceAnalyzeResult,
} from './analyzeChildProtocol';

export interface RunC4SourceAnalyzeDeps {
  /** fork 注入（テスト用）。既定は node:child_process.fork。 */
  readonly fork?: (modulePath: string, args: string[], options: { execArgv: string[] }) => ChildProcess;
  /** Node fatal report 出力先（既定 os.tmpdir()）。 */
  readonly reportDir?: string;
}

/**
 * 対話的ソース解析（exports/flowchart/sequence）を analyze-child へ one-shot 委譲する。
 * daemon（TrailDataServer）は typescript を持たないため、ファイル内容を読んで child へ送り、
 * child が createSourceFile + analyzer を実行した結果 JSON を受け取る。
 *
 * 1 リクエスト = 1 fork（クリックごとに typescript ロード）。常駐化は将来最適化（別プラン）。
 */
export function runC4SourceAnalyze(
  childScriptPath: string,
  request: C4SourceAnalyzeRequest,
  deps: RunC4SourceAnalyzeDeps = {},
): Promise<C4SourceAnalyzeResult> {
  const fork = deps.fork ?? ((m, a, o) => nodeFork(m, a, o));
  const reportDir = deps.reportDir ?? os.tmpdir();
  const child = fork(childScriptPath, [], {
    execArgv: ['--report-on-fatalerror', `--report-directory=${reportDir}`],
  });

  return new Promise<C4SourceAnalyzeResult>((resolve, reject) => {
    let resultPath: string | undefined;
    let settled = false;
    const finish = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    child.on('message', (msg: AnalyzeChildMessage) => {
      if (msg.type === 'result') resultPath = msg.resultPath;
      else if (msg.type === 'error') finish(() => reject(new Error(`c4SourceAnalyze child error: ${msg.message}`)));
    });

    child.on('exit', (code, signal) => {
      if (resultPath) {
        try {
          const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as C4SourceAnalyzeResult;
          fs.rmSync(path.dirname(resultPath), { recursive: true, force: true });
          finish(() => resolve(parsed));
        } catch (e) {
          finish(() => reject(e));
        }
        return;
      }
      finish(() => reject(new Error(`c4SourceAnalyze child terminated abnormally (code=${code}, signal=${signal})`)));
    });

    child.on('error', (e) => finish(() => reject(e)));
    child.send({ type: 'c4SourceAnalyze', request });
  });
}
