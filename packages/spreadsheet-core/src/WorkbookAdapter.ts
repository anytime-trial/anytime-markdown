import type { SheetSnapshot, WorkbookSnapshot } from "./types";

/**
 * 複数シートのワークブックを管理するアダプターインターフェース。
 * SheetAdapter（単一シート）とは独立して共存する。
 */
export interface WorkbookAdapter {
  /** 現時点のスナップショットを返す（useSyncExternalStore 互換） */
  getSnapshot(): WorkbookSnapshot;

  /** データソースの外部変更を購読する。返り値は unsubscribe */
  subscribe(listener: () => void): () => void;

  /** 指定シートの単一セルを更新する */
  setCell(sheetIndex: number, row: number, col: number, value: string): void;

  /** 指定シート全体を置き換える */
  replaceSheet(sheetIndex: number, next: SheetSnapshot): void;

  /** シートを末尾に追加する。name 省略時は "Sheet{N}" */
  addSheet(name?: string): void;

  /** 指定シートを削除する（シートが1枚のみの場合は何もしない） */
  removeSheet(sheetIndex: number): void;

  /** 指定シートの名前を変更する */
  renameSheet(sheetIndex: number, name: string): void;

  /** シートを並び替える（from → to） */
  reorderSheet(fromIndex: number, toIndex: number): void;

  /** アクティブシートを切り替える */
  setActiveSheet(index: number): void;
}
