/**
 * doc-core ingest を行う node 子プロセスのエントリ（拡張ホストから spawn される）。
 * native module 不要（node:sqlite）。doc-core を取り込むのはこのバンドル(doc-ingest.js)のみ。
 *
 * env:
 *   ANYTIME_MARKDOWN_DOC_DB     … doc-core.db の物理パス（ingest モードで必須）
 *   ANYTIME_MARKDOWN_DOCS_ROOT  … 取込元ドキュメントルート（必須）
 *   ANYTIME_MARKDOWN_DOC_MODE   … 'ingest'（既定: 取込→成功時に索引再生成）| 'index-only'（索引再生成のみ）
 * docsRoot 配下全体（サブディレクトリ非限定）を走査する。
 * 結果は stdout に JSON 1 行で出力する（親プロセスがログ化）。
 * 索引再生成の失敗は ingest の成功を取り消さない（JSON の docIndexesError で報告）。
 */

import { openDocDb, ingestDocs, ingestThenIndex, generateDocsRootIndexes } from '@anytime-markdown/doc-core';

async function main(): Promise<void> {
  const docsRoot = process.env.ANYTIME_MARKDOWN_DOCS_ROOT;
  const mode = process.env.ANYTIME_MARKDOWN_DOC_MODE === 'index-only' ? 'index-only' : 'ingest';
  if (!docsRoot) {
    process.stderr.write('[doc-ingest] missing ANYTIME_MARKDOWN_DOCS_ROOT\n');
    process.exit(2);
  }
  const onWarn = (message: string): void => {
    process.stderr.write(`${message}\n`);
  };

  if (mode === 'index-only') {
    const docIndexes = generateDocsRootIndexes({ docsRoot, onWarn });
    process.stdout.write(JSON.stringify({ docIndexes }) + '\n');
    return;
  }

  const dbPath = process.env.ANYTIME_MARKDOWN_DOC_DB;
  if (!dbPath) {
    process.stderr.write('[doc-ingest] missing ANYTIME_MARKDOWN_DOC_DB\n');
    process.exit(2);
  }
  const db = openDocDb(dbPath);
  try {
    // subDir: '' で docsRoot 配下全体（path.join(docsRoot, '') = docsRoot）を走査し、
    // 走査が成功した場合のみフォルダ索引（index.<lang>.md）を続けて再生成する。
    const r = await ingestThenIndex({
      runIngest: () => ingestDocs(db, docsRoot, { subDir: '', prune: true }),
      docsRoot,
      onWarn,
    });
    process.stdout.write(JSON.stringify(r) + '\n');
  } finally {
    db.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[doc-ingest] failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
