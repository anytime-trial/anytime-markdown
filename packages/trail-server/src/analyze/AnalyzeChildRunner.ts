import { fork as nodeFork, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AnalyzeChildRequest,
  AnalyzeComputeResult,
  AnalyzeChildMessage,
} from './analyzeChildProtocol';

export interface AnalyzeChildRunnerDeps {
  /** fork を注入（テスト用）。既定は node:child_process.fork。 */
  fork?: (modulePath: string, args: string[], options: { execArgv: string[] }) => ChildProcess;
  onProgress?: (phase: string, percent: number) => void;
  /** Node fatal report 出力先（既定 os.tmpdir()）。 */
  reportDir?: string;
  /** 1 回のリトライを許可するか（既定 true）。 */
  retryOnCrash?: boolean;
  logger?: { info(m: string): void; warn(m: string): void; error(m: string, e?: unknown): void };
}

/** 子プロセスが result を返さずに異常終了したことを表す。 */
export class AnalyzeChildCrash extends Error {
  constructor(
    readonly code: number | null,
    readonly signal: NodeJS.Signals | null,
  ) {
    super(`analyze child terminated abnormally (code=${code}, signal=${signal})`);
    this.name = 'AnalyzeChildCrash';
  }
}

/**
 * 解析子プロセスを fork し、進捗転送・結果受領・SIGSEGV リトライを管理する。
 * 子が SIGSEGV しても本クラスを呼ぶホストプロセスは生存する（別 OS プロセスのため）。
 */
export class AnalyzeChildRunner {
  constructor(
    private readonly childScriptPath: string,
    private readonly deps: AnalyzeChildRunnerDeps = {},
  ) {}

  async run(request: AnalyzeChildRequest): Promise<AnalyzeComputeResult> {
    try {
      return await this.runOnce(request);
    } catch (err) {
      const retry = this.deps.retryOnCrash ?? true;
      if (retry && err instanceof AnalyzeChildCrash) {
        this.deps.logger?.warn(`analyze child crashed (signal=${err.signal} code=${err.code}); retrying once`);
        return await this.runOnce(request);
      }
      throw err;
    }
  }

  private runOnce(request: AnalyzeChildRequest): Promise<AnalyzeComputeResult> {
    const fork = this.deps.fork ?? ((m, a, o) => nodeFork(m, a, o));
    const reportDir = this.deps.reportDir ?? os.tmpdir();
    const child = fork(this.childScriptPath, [], {
      execArgv: ['--report-on-fatalerror', `--report-directory=${reportDir}`],
    });

    return new Promise<AnalyzeComputeResult>((resolve, reject) => {
      let resultPath: string | undefined;
      let settled = false;
      const finish = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      child.on('message', (msg: AnalyzeChildMessage) => {
        if (msg.type === 'progress') this.deps.onProgress?.(msg.phase, msg.percent);
        else if (msg.type === 'result') resultPath = msg.resultPath;
        else if (msg.type === 'error') finish(() => reject(new Error(`analyze child error: ${msg.message}`)));
      });

      child.on('exit', (code, signal) => {
        if (resultPath) {
          try {
            const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AnalyzeComputeResult;
            // child が mkdtempSync で作った private dir ごと削除する (result.json + 親 dir)。
            fs.rmSync(path.dirname(resultPath), { recursive: true, force: true });
            finish(() => resolve(parsed));
          } catch (e) {
            finish(() => reject(e));
          }
          return;
        }
        finish(() => reject(new AnalyzeChildCrash(code, signal)));
      });

      child.on('error', (e) => finish(() => reject(e)));
      child.send({ type: 'analyze', request });
    });
  }
}
