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

export class DocIngestRunner implements vscode.Disposable {
  private running = false;

  constructor(
    private readonly ingestScriptPath: string,
    private readonly docsRoot: string,
    private readonly dbPath: string,
  ) {}

  /** 1 回 ingest（＋prune）を子プロセスで実行する。失敗はログのみ。 */
  runOnce(): Promise<void> {
    if (this.running) {
      MarkdownLogger.info('[doc-core] ingest already running; skip');
      return Promise.resolve();
    }
    this.running = true;
    return new Promise<void>((resolve) => {
      const child = spawn(process.execPath, [this.ingestScriptPath], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          ANYTIME_MARKDOWN_DOC_DB: this.dbPath,
          ANYTIME_MARKDOWN_DOCS_ROOT: this.docsRoot,
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
        resolve();
      });
      child.on('close', (code) => {
        if (code === 0) {
          MarkdownLogger.info(`[doc-core] ingest ${out.trim()} (db=${this.dbPath})`);
        } else {
          const tail = out.trim();
          MarkdownLogger.error(`[doc-core] ingest exited with code=${code}${tail ? ` stdout=${tail}` : ''}`);
        }
        this.running = false;
        resolve();
      });
    });
  }

  dispose(): void {
    // 子プロセスは短命のため保持・kill 不要。
  }
}
