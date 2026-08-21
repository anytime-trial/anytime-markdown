import { resolveCaravanDbPath, resolveDbPath, resolveWorkspacePath } from './dbPath';
import { openCaravanDb, openTrailDb } from './sqlite/openDb';
import { classifyDbOpenError, describeDbOpenFailure } from './sqlite/dbOpenError';

export type SelfCheckedDb = 'caravan-book.db' | 'activity.db';

export interface DbSelfCheckFailure {
  readonly db: SelfCheckedDb;
  readonly error: unknown;
}

export interface DbSelfCheckResult {
  /** 1 つでも開けたか。false なら DB を読むツールはすべて失敗する。 */
  readonly ok: boolean;
  readonly workspacePath: string;
  readonly failures: readonly DbSelfCheckFailure[];
}

/**
 * 起動直後に DB を 1 回 readonly で開いて疎通を確かめる。
 *
 * Why not 個々のツール呼び出しの失敗に任せる: ツールは 1 行のエラーしか返さないため、
 * 利用側からは「そのツールがたまたま失敗した」ようにしか見えない。実際には開く経路が
 * 壊れていて DB 依存ツールが全滅していることがあり、その状態が 17 日以上気づかれずに
 * 続いた（2026-08-20 anytime-trade 報告。記録の残る全期間で成功 0 件）。起動時に
 * 「全滅している」と名指しで stderr へ出す。
 *
 * 本関数は **throw しない**。self-check の失敗でサーバ起動を止めると、DB を使わない
 * ツール（HTTP 経由の解析系）まで巻き添えになるため、診断だけ出して起動は続ける。
 */
export async function runStartupDbSelfCheck(opts?: {
  workspacePath?: string;
  log?: (message: string) => void;
}): Promise<DbSelfCheckResult> {
  const log = opts?.log ?? ((message: string) => process.stderr.write(`${message}\n`));
  const workspacePath = resolveWorkspacePath(opts?.workspacePath).path;
  const failures: DbSelfCheckFailure[] = [];

  for (const db of ['caravan-book.db', 'activity.db'] as const) {
    try {
      const dbPath =
        db === 'caravan-book.db'
          ? resolveCaravanDbPath({ workspacePath })
          : resolveDbPath({ workspacePath });
      const opened =
        db === 'caravan-book.db'
          ? await openCaravanDb(dbPath, 'readonly')
          : await openTrailDb(dbPath, 'readonly');
      opened.close();
    } catch (error) {
      failures.push({ db, error });
    }
  }

  const ok = failures.length < 2;
  if (failures.length > 0) {
    const timestamp = new Date().toISOString();
    for (const failure of failures) {
      log(
        `[${timestamp}] [WARN] [mcp-trail] self-check: ${failure.db} を開けませんでした ` +
          `(workspace=${workspacePath}): ${describeDbOpenFailure(failure.error)}`,
      );
    }
  }
  if (!ok) {
    const timestamp = new Date().toISOString();
    const kinds = new Set(failures.map((f) => classifyDbOpenError(f.error)));
    const sharedCause = kinds.size === 1 && kinds.has('native-binding');
    log(
      `[${timestamp}] [ERROR] [mcp-trail] self-check: DB を 1 つも開けません ` +
        `(workspace=${workspacePath})。DB を読む mcp-trail ツールはこのプロセスが生きている間すべて失敗します。` +
        (sharedCause
          ? ' 原因は両 DB に共通の native binary 解決失敗です（DB ファイルの問題ではありません）。'
          : ''),
    );
  }
  return { ok, workspacePath, failures };
}
