import type { Database } from 'sql.js';

/**
 * DatabaseIntegrityMonitor
 *
 * 主要テーブルの行数を保存時にスナップショットし、前回との比較で
 * 異常な減少（= データ破壊の可能性）を検出する。VS Code 拡張のランタイムに
 * 組み込み、検出時に警告ログを出すことで、静かに進行するデータ消失を
 * 早期に可視化することが目的。
 *
 * 2026-04-20 の事故（~/.claude/trail/trail.db の sessions 行が全消失）では、
 * 拡張機能側が一切警告を出さずに動作を継続していた。本モニターは同種の
 * 事象を「黙って進行させない」ためのランタイム番人。
 */

const WATCHED_TABLES = [
  'sessions',
  'messages',
  'c4_models',
  'current_graphs',
  'c4_manual_elements',
  'c4_manual_relationships',
] as const;

type WatchedTable = typeof WATCHED_TABLES[number];

export type TableCounts = Readonly<Record<WatchedTable, number>> & { readonly capturedAt: string };

export interface IntegrityAlert {
  readonly table: WatchedTable;
  readonly previous: number;
  readonly current: number;
  readonly lossRate: number;
  readonly capturedAt: string;
}

export interface DatabaseIntegrityMonitorOptions {
  /** この比率以上の減少を警告対象とする（デフォルト 0.1 = 10%） */
  readonly alertLossRate?: number;
  /** 絶対減少数がこれ以上の場合も警告（小規模テーブル保護、デフォルト 50 行） */
  readonly alertAbsoluteLoss?: number;
}

export class DatabaseIntegrityMonitor {
  private lastSnapshot: TableCounts | null = null;
  private readonly alertLossRate: number;
  private readonly alertAbsoluteLoss: number;

  constructor(options: DatabaseIntegrityMonitorOptions = {}) {
    this.alertLossRate = options.alertLossRate ?? 0.1;
    this.alertAbsoluteLoss = options.alertAbsoluteLoss ?? 50;
  }

  /** 現在のスナップショットを取得する（lastSnapshot は更新しない）。 */
  captureCounts(db: Database): TableCounts {
    const counts: Record<string, number | string> = {
      capturedAt: new Date().toISOString(),
    };
    for (const table of WATCHED_TABLES) {
      counts[table] = this.countRows(db, table);
    }
    return counts as unknown as TableCounts;
  }

  /** 前回スナップショットとの比較結果を返す（状態は更新しない）。 */
  detectRegression(current: TableCounts, previous: TableCounts): readonly IntegrityAlert[] {
    const alerts: IntegrityAlert[] = [];
    for (const table of WATCHED_TABLES) {
      const prev = previous[table];
      const curr = current[table];
      if (prev === 0 || curr >= prev) continue;
      const loss = prev - curr;
      const lossRate = loss / prev;
      if (lossRate >= this.alertLossRate || loss >= this.alertAbsoluteLoss) {
        alerts.push({
          table,
          previous: prev,
          current: curr,
          lossRate,
          capturedAt: current.capturedAt,
        });
      }
    }
    return alerts;
  }

  /**
   * スナップショットを記録し、前回から減少があれば返す。
   * 初回呼び出し時は空配列を返す（比較対象なし）。
   */
  recordAndDetect(db: Database): readonly IntegrityAlert[] {
    const current = this.captureCounts(db);
    const previous = this.lastSnapshot;
    this.lastSnapshot = current;
    if (!previous) return [];
    return this.detectRegression(current, previous);
  }

  /** テスト用。外部から状態をリセット可能にしておく。 */
  reset(): void {
    this.lastSnapshot = null;
  }

  private countRows(db: Database, table: WatchedTable): number {
    try {
      const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
      return Number(result[0]?.values?.[0]?.[0] ?? 0);
    } catch {
      // テーブル未作成時は 0 として扱う（警告ループを誘発しない）
      return 0;
    }
  }
}
