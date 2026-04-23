import type { SheetSnapshot } from "./types";

/**
 * スプレッドシート UI と任意のデータソースを疎結合にする Adapter インタフェース。
 * Tiptap table / CSV / JSON / DB など、実装ごとに差し替えて使用する。
 */
export interface SheetAdapter {
  /** 現時点のスナップショットを返す（useSyncExternalStore 互換） */
  getSnapshot(): SheetSnapshot;

  /** データソースの外部変更を購読する。返り値は unsubscribe */
  subscribe(listener: () => void): () => void;

  /** 単一セルの値更新 */
  setCell(row: number, col: number, value: string): void;

  /** 表全体を置き換える（構造変更・配置変更はこの経路） */
  replaceAll(next: SheetSnapshot): void;

  /** 読み取り専用フラグ */
  readonly readOnly?: boolean;

  /** 外部からスナップショットを注入する（初期データロード等） */
  applySnapshot?(snapshot: SheetSnapshot): void;

  /** 外部からテキスト（CSV/TSV）を注入する */
  applyText?(text: string): void;
}
