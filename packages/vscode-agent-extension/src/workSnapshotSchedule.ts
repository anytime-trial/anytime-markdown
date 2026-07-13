const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 60;

/**
 * 設定値（分）をタイマー間隔（ms）へ正規化する。
 * 0 と負値・NaN は無効（null）。1〜4 は 5 分へ切り上げる（毎分スナップショットは ref を無駄に増やす）。
 */
export function normalizeSnapshotIntervalMs(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const clamped = Math.min(Math.max(minutes, MIN_INTERVAL_MINUTES), MAX_INTERVAL_MINUTES);
  return clamped * 60 * 1000;
}

/** 保持日数から prune の cutoff（UTC ISO）を求める。 */
export function retentionCutoffIso(nowIso: string, retentionDays: number): string {
  const cutoff = new Date(new Date(nowIso).getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}
