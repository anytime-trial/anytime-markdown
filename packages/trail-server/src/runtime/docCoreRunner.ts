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

/** doc-core ランナーのライフサイクル配線オプション。 */
export interface WireDocCoreOptions {
  /** ドキュメントリポジトリのルート。空文字/空白のみなら doc-core を無効化（null を返す）。 */
  docsRoot: string;
  /** doc-core.db の物理パス。 */
  dbPath: string;
  /** 埋め込み生成関数（ollama bge-m3）。未指定なら embedding をスキップ。 */
  embed?: EmbedFn;
  /** 埋め込みモデル名。embed と対で必要。 */
  embedModel?: string;
  /** 走査サブディレクトリ（既定 `spec`）。 */
  subDir?: string;
  /** true の場合のみ定期 ingest を有効化する。 */
  schedulerEnabled: boolean;
  /** 定期 ingest 間隔ミリ秒（既定 30 分）。 */
  intervalMs?: number;
  logSink: { appendLine: (msg: string) => void };
}

/** 配線済み doc-core ランナーのハンドル。 */
export interface WiredDocCore {
  dispose(): void;
}

/**
 * doc-core ランナーを「生成 → 初回 ingest → 任意で定期 ingest → dispose 可能ハンドル返却」まで
 * 一括で配線する共有ヘルパ。standalone CLI (cli.ts) と trail-daemon child process
 * (trailDaemonEntry.ts) の双方がこれを消費し、配線ロジックを単一の真実とする
 * （片方のエントリだけ配線が漏れる事故を構造的に防ぐ）。
 *
 * `docsRoot` が空なら doc-core 無効として `null` を返す（呼び出し側で ollama クライアント等の
 * 生成も省略できるよう、呼び出し側にも同等のガードを置いてよい）。
 */
export function wireDocCoreRunner(opts: WireDocCoreOptions): WiredDocCore | null {
  const docsRoot = opts.docsRoot.trim();
  if (!docsRoot) return null;

  const runner = createDocCoreRunner({
    docsRoot,
    dbPath: opts.dbPath,
    ...(opts.subDir ? { subDir: opts.subDir } : {}),
    ...(opts.embed ? { embed: opts.embed } : {}),
    ...(opts.embedModel ? { embedModel: opts.embedModel } : {}),
    logSink: opts.logSink,
  });

  void runner.runOnce();

  let interval: ReturnType<typeof setInterval> | null = null;
  if (opts.schedulerEnabled) {
    interval = setInterval(() => void runner.runOnce(), opts.intervalMs ?? 30 * 60 * 1000);
  }

  opts.logSink.appendLine(
    `[${new Date().toISOString()}] [doc-core] runner wired docsRoot=${docsRoot} dbPath=${opts.dbPath} scheduler=${opts.schedulerEnabled} embed=${Boolean(opts.embed)}`,
  );

  return {
    dispose(): void {
      if (interval) clearInterval(interval);
      runner.dispose();
    },
  };
}
