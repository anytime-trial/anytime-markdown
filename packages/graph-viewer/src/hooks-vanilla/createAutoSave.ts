import { saveDocument, setLastDocumentId } from '../store/graphStorage';
import type { SaveStatus } from '../types/persistence';
import type { GraphDocument } from '../types';

export type { SaveStatus };

export interface AutoSaveOptions {
  debounceMs?: number;
  onStatusChange?: (status: SaveStatus) => void;
}

export interface AutoSave {
  /** 変更を通知して debounce 付き自動保存をトリガする */
  notifyChange(doc: GraphDocument): void;
  /** 現在の保存ステータスを返す */
  getStatus(): SaveStatus;
  /** タイマーをキャンセルしリソースを解放する */
  destroy(): void;
}

/**
 * useAutoSave 相当の vanilla factory。
 * setTimeout debounce + rAF で SaveStatus を管理する。
 * destroy() を呼ばないとタイマーが残り続けるため、
 * ホスト側はアンマウント/destroy 時に必ず呼ぶこと。
 */
export function createAutoSave(opts: AutoSaveOptions = {}): AutoSave {
  const { debounceMs = 1000, onStatusChange } = opts;

  let status: SaveStatus = 'saved';
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let rafId = 0;

  function setStatus(next: SaveStatus): void {
    status = next;
    onStatusChange?.(next);
  }

  function notifyChange(doc: GraphDocument): void {
    if (timerId !== null) clearTimeout(timerId);
    cancelAnimationFrame(rafId);

    // ドラッグ中の同期レンダーチェーンを断ち切るため rAF に遅延
    rafId = requestAnimationFrame(() => setStatus('saving'));

    timerId = setTimeout(() => {
      timerId = null;
      (async () => {
        try {
          await saveDocument(doc);
          setLastDocumentId(doc.id);
          setStatus('saved');
        } catch (e) {
          console.error('[createAutoSave] Auto-save failed:', e);
          setStatus('error');
        }
      })();
    }, debounceMs);
  }

  function getStatus(): SaveStatus {
    return status;
  }

  function destroy(): void {
    cancelAnimationFrame(rafId);
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  return { notifyChange, getStatus, destroy };
}
