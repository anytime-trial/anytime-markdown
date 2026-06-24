/**
 * doc-core ingest を行う node 子プロセスのエントリ（拡張ホストから spawn される）。
 * native module 不要（node:sqlite）。doc-core を取り込むのはこのバンドル(doc-ingest.js)のみ。
 *
 * env:
 *   ANYTIME_MARKDOWN_DOC_DB     … doc-core.db の物理パス（必須）
 *   ANYTIME_MARKDOWN_DOCS_ROOT  … 取込元ドキュメントルート（必須）
 * docsRoot 配下全体（サブディレクトリ非限定）を走査する。
 * 結果は stdout に JSON 1 行で出力する（親プロセスがログ化）。
 */

import { openDocDb, ingestDocs } from '@anytime-markdown/doc-core';

async function main(): Promise<void> {
  const dbPath = process.env.ANYTIME_MARKDOWN_DOC_DB;
  const docsRoot = process.env.ANYTIME_MARKDOWN_DOCS_ROOT;
  if (!dbPath || !docsRoot) {
    process.stderr.write('[doc-ingest] missing ANYTIME_MARKDOWN_DOC_DB or ANYTIME_MARKDOWN_DOCS_ROOT\n');
    process.exit(2);
  }
  const db = openDocDb(dbPath);
  try {
    // subDir: '' で docsRoot 配下全体（path.join(docsRoot, '') = docsRoot）を走査する。
    const r = await ingestDocs(db, docsRoot, { subDir: '', prune: true });
    process.stdout.write(JSON.stringify(r) + '\n');
  } finally {
    db.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[doc-ingest] failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
