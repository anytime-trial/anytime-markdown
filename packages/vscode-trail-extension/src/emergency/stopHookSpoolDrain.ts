// Stop フック記録（flight-review / safe-point）spool の定期 drain。
//
// Stop フック（bash）が `<git-common-dir>/anytime/stop-hook-spool.jsonl` へ書いた記録を、
// activate 直後 + 60 秒周期で読み出し、kind に応じて既存の daemon HTTP API
// （`/api/trail/flight-reviews` / `/api/trail/safe-points`）へ POST する。
// POST に失敗したイベントは spool へ書き戻して次周期でリトライする（at-least-once。
// 再送はサーバ側の冪等 upsert / 冪等 INSERT が吸収する）。emergencySpoolDrain と同方式。
// drain 対象は候補ルート全部の git-common-dir（spoolDrainRoots）。設定値 1 つに頼ると、
// 設定が壊れたときフックの書き先と食い違って黙って止まる（T-32）。
import {
  appendStopHookSpool,
  consolidateStopHookSpoolEvents,
  drainStopHookSpool,
  stopHookSpoolPath,
} from '@anytime-markdown/agent-core';
import type { StopHookSpoolEvent } from '@anytime-markdown/agent-core';

import { TrailLogger } from '../utils/TrailLogger';
import { resolveSpoolDrainDirs } from './spoolDrainRoots';

const DRAIN_INTERVAL_MS = 60_000;
const POST_TIMEOUT_MS = 3000;

export interface StopHookSpoolDrainDeps {
  /** drain 候補ルート（設定値・workspaceFolders・lep.json gitRoots）。git-common-dir 単位で重複排除される。 */
  getWorkspacePaths: () => readonly (string | undefined)[];
  getPort: () => number;
  /** 省略時は TrailLogger.warn。テストで警告を捕捉するために差し替える。 */
  warn?: (message: string) => void;
}

function endpointFor(ev: StopHookSpoolEvent, port: number): string {
  const base = `http://127.0.0.1:${port}/api/trail`;
  return ev.kind === 'flight_review' ? `${base}/flight-reviews` : `${base}/safe-points`;
}

async function postEvent(port: number, ev: StopHookSpoolEvent): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
    try {
      const res = await fetch(endpointFor(ev, port), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ev.payload),
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    TrailLogger.error(`stop-hook spool: POST failed (${ev.kind})`, err);
    return false;
  }
}

async function drainDir(dir: string, port: number, warn: (m: string) => void): Promise<number> {
  const drained = drainStopHookSpool(stopHookSpoolPath(dir), (m) => warn(`stop-hook spool: ${m}`));
  if (drained.length === 0) return 0;
  const events = consolidateStopHookSpoolEvents(drained);

  let ingested = 0;
  for (const ev of events) {
    if (await postEvent(port, ev)) {
      ingested++;
    } else {
      // daemon 未起動等。書き戻して次周期でリトライ（黙って捨てない）。
      appendStopHookSpool(dir, ev, (m) => warn(`stop-hook spool: ${m}`));
    }
  }
  if (ingested > 0) {
    TrailLogger.info(
      `stop-hook spool: ${ingested}/${events.length} 件を記録した（drain 前 ${drained.length} 行・${dir}）`,
    );
  }
  return ingested;
}

/**
 * 副作用: 候補ルートごとの spool を読み出して flight-reviews / safe-points へ POST する（1 周期分）。
 * POST 前に縮約する（flight_review は sessionId ごとに最新 1 件・safe_point は同一タプル 1 件。
 * Stop はターン毎に発火するため、滞留分の逐次 POST は無駄打ちになる）。
 * 失敗イベントは spool へ再追記する（上限規則は appendStopHookSpool 側に従う）。
 * 戻り値は取り込んだ件数（テスト・ログ用）。
 */
export async function drainStopHookSpoolOnce(deps: StopHookSpoolDrainDeps): Promise<number> {
  const warn = deps.warn ?? ((m: string) => TrailLogger.warn(m));
  const dirs = resolveSpoolDrainDirs(deps.getWorkspacePaths(), warn);
  if (dirs.length === 0) return 0; // git repo 外（fail-open。未解決パスは resolver が警告済み）

  const port = deps.getPort();
  let ingested = 0;
  for (const dir of dirs) {
    ingested += await drainDir(dir, port, warn);
  }
  return ingested;
}

/** activate 直後 + 60 秒周期で drain する。dispose でタイマー停止。 */
export function startStopHookSpoolDrain(deps: StopHookSpoolDrainDeps): { dispose(): void } {
  void drainStopHookSpoolOnce(deps);
  const timer = setInterval(() => {
    void drainStopHookSpoolOnce(deps);
  }, DRAIN_INTERVAL_MS);
  // Extension Host の終了を interval が阻害しないようにする
  timer.unref?.();
  return {
    dispose() {
      clearInterval(timer);
    },
  };
}
