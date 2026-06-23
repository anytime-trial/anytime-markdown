/**
 * doc-core ingest を daemon でホストする疎結合ランナー。
 *
 * memory-core/importAll とは独立した別 DB（doc-core.db）への ingest で、失敗が trail 本体の
 * パイプラインを巻き込まないよう全体を try/catch で隔離する。embedding は注入式（ollama 未到達でも
 * 構造＋FTS は成立し、embedding だけスキップ）。
 */

import { writeFileSync, renameSync } from 'node:fs';
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
  /**
   * 直近 run の結果（ingest/embed/突合）を書き出す JSON パス。未指定なら書き出さない。
   * ephemeral な OutputChannel ログと違い永続するため、embed 失敗や doc_embedding=0 を
   * 外部（Trail 診断・SQL・人手）から観測できる（silent failure 撲滅）。
   */
  statusPath?: string;
  logSink: { appendLine: (msg: string) => void };
}

/** 直近 run の結果。statusPath に JSON として書き出される。 */
export interface DocCoreRunStatus {
  ranAt: string;
  /** ingest/embed/突合 のいずれにも致命的エラーが無ければ true。 */
  ok: boolean;
  ingest?: { scanned: number; ingested: number; skipped: number; removed: number };
  ingestError?: string;
  embed?: { embedded: number; skipped: number; failed: number; firstError?: string };
  embedError?: string;
  /** embedding をスキップした理由（embed/embedModel 未注入）。 */
  embedSkippedReason?: string;
  /** 突合（reconciliation）: doc 件数 vs doc_embedding 件数。missing>0 はベクトル検索の欠落。 */
  reconcile?: { docs: number; embeddings: number; missing: number };
}

export interface DocCoreRunner {
  /** 1 回 ingest（＋embedding backfill＋突合）を実行する。各段の失敗は status と log に記録する。 */
  runOnce(): Promise<void>;
  dispose(): void;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

export function createDocCoreRunner(opts: DocCoreRunnerOptions): DocCoreRunner {
  let db: DocDb | null = null;
  const log = (msg: string): void => opts.logSink.appendLine(`[${new Date().toISOString()}] [doc-core] ${msg}`);

  const countRows = (database: DocDb, table: 'doc' | 'doc_embedding'): number =>
    (database.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as unknown as { c: number }).c;

  const writeStatus = (status: DocCoreRunStatus): void => {
    if (!opts.statusPath) return;
    try {
      // temp へ書いてから rename（同一ディレクトリ内 rename はアトミック）。
      // 観測の単一の真実なので、書き込み途中をリーダが拾わないよう保証する。
      const tmp = `${opts.statusPath}.tmp`;
      writeFileSync(tmp, JSON.stringify(status, null, 2), 'utf8');
      renameSync(tmp, opts.statusPath);
    } catch (err) {
      // status 書き出し失敗自体も握り潰さずログに残す。
      log(`status write failed path=${opts.statusPath} ${errMsg(err)}`);
    }
  };

  return {
    async runOnce(): Promise<void> {
      const status: DocCoreRunStatus = { ranAt: new Date().toISOString(), ok: true };

      // 0. DB open（失敗したら以降は不能なので記録して終了）。
      try {
        db ??= openDocDb(opts.dbPath);
      } catch (err) {
        status.ok = false;
        status.ingestError = errMsg(err);
        log(`ERROR open db path=${opts.dbPath} ${status.ingestError}`);
        writeStatus(status);
        return;
      }

      // 1. ingest（構造＋FTS）。失敗しても embed は無意味なので記録して終了。
      try {
        const r = await ingestDocs(db, opts.docsRoot, { subDir: opts.subDir, prune: true });
        status.ingest = { scanned: r.scanned, ingested: r.ingested, skipped: r.skipped, removed: r.removed };
        log(`ingest scanned=${r.scanned} ingested=${r.ingested} skipped=${r.skipped} removed=${r.removed}`);
      } catch (err) {
        status.ok = false;
        status.ingestError = errMsg(err);
        log(`ERROR ingest ${status.ingestError}`);
        writeStatus(status);
        return;
      }

      // 2. embedding backfill（独立 try/catch）。embed 失敗は ingest 成功を巻き込まない。
      if (opts.embed && opts.embedModel) {
        try {
          const e = await embedDocs(db, opts.embed, { model: opts.embedModel });
          status.embed = {
            embedded: e.embedded,
            skipped: e.skipped,
            failed: e.failed,
            ...(e.firstError === undefined ? {} : { firstError: e.firstError }),
          };
          log(`embed embedded=${e.embedded} skipped=${e.skipped} failed=${e.failed}`);
          if (e.failed > 0) {
            status.ok = false;
            log(`embed had ${e.failed} failures; first: ${e.firstError ?? '(unknown)'}`);
          }
        } catch (err) {
          status.ok = false;
          status.embedError = errMsg(err);
          log(`ERROR embed ${status.embedError}`);
        }
      } else {
        status.embedSkippedReason = 'embed/embedModel not provided';
        log('embed skipped: embed/embedModel not provided');
      }

      // 3. 突合（reconciliation）: doc 件数 vs doc_embedding 件数。乖離（成功報告と実 DB の不一致）を可視化。
      try {
        const docs = countRows(db, 'doc');
        const embeddings = countRows(db, 'doc_embedding');
        const missing = docs - embeddings;
        status.reconcile = { docs, embeddings, missing };
        if (docs > 0 && embeddings === 0) {
          status.ok = false;
          log(`WARN reconcile: docs=${docs} but doc_embedding=0 — semantic search inactive`);
        } else if (missing > 0) {
          log(`reconcile docs=${docs} embeddings=${embeddings} missing=${missing}`);
        } else {
          log(`reconcile docs=${docs} embeddings=${embeddings} (complete)`);
        }
      } catch (err) {
        log(`reconcile failed ${errMsg(err)}`);
      }

      writeStatus(status);
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
  /** 直近 run の結果（ingest/embed/突合）を書き出す JSON パス。未指定なら書き出さない。 */
  statusPath?: string;
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
    ...(opts.statusPath ? { statusPath: opts.statusPath } : {}),
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
