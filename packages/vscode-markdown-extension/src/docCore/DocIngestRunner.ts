/**
 * doc-core.db（markdown 拡張専用）の ingest ランナー。
 *
 * doc-core / node:sqlite を拡張ホスト本体に取り込まず、同梱した node バンドル
 * `dist/doc-ingest.js` を子プロセス（`process.execPath` + `ELECTRON_RUN_AS_NODE`）として
 * 起動して ingest する。これにより拡張本体バンドルは doc-core 非依存を保ち、
 * 非 WSL（Electron）環境でも本物の Node 実行系で node:sqlite を使える。
 */

import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { MarkdownLogger } from '../utils/MarkdownLogger';

export { resolveDocDbPath } from './docDbPath';

/** 子プロセス（ingestEntry）が stdout に出す JSON の形。索引件数の通知に使う。 */
export interface DocIngestRunResult {
  readonly docIndexes?: { readonly written: number; readonly unchanged: number };
  readonly docIndexesError?: string;
}

export class DocIngestRunner implements vscode.Disposable {
  private running = false;

  constructor(
    private readonly ingestScriptPath: string,
    private readonly docsRoot: string,
    private readonly dbPath: string,
  ) {}

  /**
   * 1 回 ingest（＋prune・成功時はフォルダ索引再生成）を子プロセスで実行する。失敗はログのみ。
   *
   * @param mode 'ingest'（既定）は取込→索引再生成、'index-only' は索引再生成だけを行う
   * @returns 子プロセスが stdout に出した JSON（索引件数の通知用）。失敗・解析不能時は null
   */
  runOnce(mode: 'ingest' | 'index-only' = 'ingest'): Promise<DocIngestRunResult | null> {
    if (this.running) {
      MarkdownLogger.info('[doc-core] ingest already running; skip');
      return Promise.resolve(null);
    }
    this.running = true;
    return new Promise<DocIngestRunResult | null>((resolve) => {
      const child = spawn(process.execPath, [this.ingestScriptPath], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          ANYTIME_MARKDOWN_DOC_DB: this.dbPath,
          ANYTIME_MARKDOWN_DOCS_ROOT: this.docsRoot,
          ANYTIME_MARKDOWN_DOC_MODE: mode,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        MarkdownLogger.warn(`[doc-core] ${d.toString().trimEnd()}`);
      });
      child.on('error', (err) => {
        MarkdownLogger.error('[doc-core] ingest spawn failed', err);
        this.running = false;
        resolve(null);
      });
      child.on('close', (code) => {
        this.running = false;
        if (code !== 0) {
          const tail = out.trim();
          MarkdownLogger.error(`[doc-core] ingest exited with code=${code}${tail ? ` stdout=${tail}` : ''}`);
          resolve(null);
          return;
        }
        MarkdownLogger.info(`[doc-core] ingest ${out.trim()} (db=${this.dbPath})`);
        try {
          resolve(JSON.parse(out.trim()) as DocIngestRunResult);
        } catch (err) {
          MarkdownLogger.warn(`[doc-core] ingest output parse failed: ${String(err)}`);
          resolve(null);
        }
      });
    });
  }

  dispose(): void {
    // 子プロセスは短命のため保持・kill 不要。
  }
}
