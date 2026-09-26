// Phase 5 S2 (Emergency Protocol): emergency spool の定期 drain。
//
// フック（agent-status-report.mjs の loop-check モード）が `<git-common-dir>/anytime/
// emergency-spool.jsonl` へ書いた検知イベントを、activate 直後 + 60 秒周期で読み出し、
// S1 と同じ daemon HTTP API（`/api/trail/emergency-log`）へ 1 件ずつ POST する。
// POST に失敗したイベントは spool へ書き戻して次周期でリトライする（要件書 §12.4）。
import {
  appendEmergencySpool,
  drainEmergencySpool,
  emergencySpoolPath,
} from '@anytime-markdown/agent-core';
import type { EmergencySpoolEvent } from '@anytime-markdown/agent-core';

import { TrailLogger } from '../utils/TrailLogger';
import { resolveSpoolDrainDirs } from './spoolDrainRoots';

const DRAIN_INTERVAL_MS = 60_000;
const POST_TIMEOUT_MS = 3000;

export interface EmergencySpoolDrainDeps {
  /** drain 候補ルート（設定値・workspaceFolders・lep.json gitRoots）。git-common-dir 単位で重複排除される（T-32）。 */
  getWorkspacePaths: () => readonly (string | undefined)[];
  getPort: () => number;
  /** 省略時は TrailLogger.warn。テストで警告を捕捉するために差し替える。 */
  warn?: (message: string) => void;
}

async function postEvent(port: number, ev: EmergencySpoolEvent): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/trail/emergency-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ev),
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    TrailLogger.error(`emergency spool: POST failed (${ev.event})`, err);
    return false;
  }
}

/**
 * 副作用: spool を読み出して activity_emergency_log へ POST する（1 周期分）。
 * 失敗イベントは spool へ再追記する（上限規則は appendEmergencySpool 側に従う）。
 * 戻り値は取り込んだ件数（テスト・ログ用）。
 */
async function drainDir(dir: string, port: number, warn: (m: string) => void): Promise<number> {
  const events = drainEmergencySpool(emergencySpoolPath(dir), (m) => warn(`emergency spool: ${m}`));
  if (events.length === 0) return 0;

  let ingested = 0;
  for (const ev of events) {
    if (await postEvent(port, ev)) {
      ingested++;
    } else {
      // daemon 未起動等。書き戻して次周期でリトライ（黙って捨てない）。
      appendEmergencySpool(dir, ev, (m) => warn(`emergency spool: ${m}`));
    }
  }
  if (ingested > 0) {
    TrailLogger.info(
      `emergency spool: ${ingested}/${events.length} 件を activity_emergency_log へ記録した（${dir}）`,
    );
  }
  return ingested;
}

export async function drainOnce(deps: EmergencySpoolDrainDeps): Promise<number> {
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
export function startEmergencySpoolDrain(deps: EmergencySpoolDrainDeps): { dispose(): void } {
  void drainOnce(deps);
  const timer = setInterval(() => {
    void drainOnce(deps);
  }, DRAIN_INTERVAL_MS);
  // Extension Host の終了を interval が阻害しないようにする
  timer.unref?.();
  return {
    dispose() {
      clearInterval(timer);
    },
  };
}
