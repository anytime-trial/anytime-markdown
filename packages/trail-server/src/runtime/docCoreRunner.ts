/**
 * doc-core ingest を daemon でホストする疎結合ランナー。
 *
 * memory-core/importAll とは独立した別 DB（doc-core.db）への ingest で、失敗が trail 本体の
 * パイプラインを巻き込まないよう全体を try/catch で隔離する。embedding は注入式（ollama 未到達でも
 * 構造＋FTS は成立し、embedding だけスキップ）。
 */

import { openDocDb, ingestDocs, embedDocs, type DocDb, type EmbedFn } from '@anytime-markdown/doc-core';

export interface DocCoreRunnerOptions {
  /** ドキュメントリポジトリのルート（例 `/Shared/anytime-markdown-docs`）。 */
  docsRoot: string;
  /** doc-core.db の物理パス。 */
  dbPath: string;
  /** 走査サブディレクトリ（既定 `spec`）。 */
  subDir?: string;
  /** 埋め込み生成関数（ollama bge-m3）。未指定なら embedding をスキップ。 */
  embed?: EmbedFn;
  /** 埋め込みモデル名（doc_embedding.model）。embed と対で必要。 */
  embedModel?: string;
  logSink: { appendLine: (msg: string) => void };
}

export interface DocCoreRunner {
  /** 1 回 ingest（＋embedding backfill）を実行する。失敗は内部で握り潰しログのみ。 */
  runOnce(): Promise<void>;
  dispose(): void;
}

export function createDocCoreRunner(opts: DocCoreRunnerOptions): DocCoreRunner {
  let db: DocDb | null = null;
  const log = (msg: string): void => opts.logSink.appendLine(`[${new Date().toISOString()}] [doc-core] ${msg}`);

  return {
    async runOnce(): Promise<void> {
      try {
        db ??= openDocDb(opts.dbPath);
        const r = await ingestDocs(db, opts.docsRoot, { subDir: opts.subDir, prune: true });
        log(`ingest scanned=${r.scanned} ingested=${r.ingested} skipped=${r.skipped} removed=${r.removed}`);
        if (opts.embed && opts.embedModel) {
          const e = await embedDocs(db, opts.embed, { model: opts.embedModel });
          log(`embed embedded=${e.embedded} skipped=${e.skipped}`);
        }
      } catch (err) {
        log(`ERROR ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      }
    },
    dispose(): void {
      try {
        db?.close();
      } catch (err) {
        log(`dispose error ${String(err)}`);
      }
      db = null;
    },
  };
}
