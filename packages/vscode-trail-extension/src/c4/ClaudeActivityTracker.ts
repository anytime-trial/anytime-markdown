import type { C4Element, C4Model } from '@anytime-markdown/trail-core/c4';
import type { StatusChangeCallback, SessionEdit } from '@anytime-markdown/vscode-common';
import { TrailLogger } from '../utils/TrailLogger';

export interface ClaudeActivityState {
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

type ActivityChangeCallback = (state: ClaudeActivityState) => void;

export class ClaudeActivityTracker {
  /** file::relPath → elementId（code 要素） */
  private fileIndex = new Map<string, string>();
  /** elementId → parentId（boundaryId チェーン） */
  private parentIndex = new Map<string, string>();

  private activeElementIds: string[] = [];
  private touchedElementIds = new Set<string>();
  private plannedElementIds = new Set<string>();
  private workspaceRoot = '';
  private readonly changeCallbacks: ActivityChangeCallback[] = [];

  /** C4モデルが更新されたときに呼び出す */
  setModel(model: C4Model, workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`;
    this.buildIndexes(model.elements);
  }

  /** ClaudeStatusWatcher.onStatusChange に渡すコールバック */
  readonly onFileEditing: StatusChangeCallback = (editing: boolean, filePath: string): void => {
    if (!editing) {
      this.activeElementIds = [];
      this.notifyChange();
      return;
    }

    const ids = this.resolveElementIds(filePath);
    if (ids.length === 0) {
      TrailLogger.info(`ClaudeActivityTracker: no C4 element for ${filePath} (root=${this.workspaceRoot}, indexed=${this.fileIndex.size})`);
      return;
    }

    TrailLogger.info(`ClaudeActivityTracker: active elements for ${filePath}: ${ids.join(', ')}`);
    this.activeElementIds = ids;
    for (const id of ids) {
      this.touchedElementIds.add(id);
    }
    this.notifyChange();
  };

  /** plannedEdits の絶対パス配列から plannedElementIds を解決してセットする */
  setPlannedEdits(absolutePaths: readonly string[]): void {
    this.plannedElementIds.clear();
    for (const filePath of absolutePaths) {
      const ids = this.resolveElementIds(filePath);
      for (const id of ids) {
        this.plannedElementIds.add(id);
      }
    }
    this.notifyChange();
  }

  /** セッション履歴から touchedElementIds を復元する */
  restoreSessionEdits(edits: readonly SessionEdit[]): void {
    for (const edit of edits) {
      const ids = this.resolveElementIds(edit.file);
      for (const id of ids) {
        this.touchedElementIds.add(id);
      }
    }
    if (this.touchedElementIds.size > 0) {
      this.notifyChange();
    }
  }

  resetTouched(): void {
    this.activeElementIds = [];
    this.touchedElementIds.clear();
    this.plannedElementIds.clear();
    this.notifyChange();
  }

  getState(): ClaudeActivityState {
    const planned = [...this.plannedElementIds]
      .filter((id) => !this.touchedElementIds.has(id));
    return {
      activeElementIds: [...this.activeElementIds],
      touchedElementIds: [...this.touchedElementIds],
      plannedElementIds: planned,
    };
  }

  onChange(cb: ActivityChangeCallback): void {
    this.changeCallbacks.push(cb);
  }

  dispose(): void {
    this.changeCallbacks.length = 0;
  }

  // ---------------------------------------------------------------------------
  //  Private
  // ---------------------------------------------------------------------------

  private buildIndexes(elements: readonly C4Element[]): void {
    this.fileIndex.clear();
    this.parentIndex.clear();
    this.indexElements(elements);
  }

  private indexElements(elements: readonly C4Element[]): void {
    for (const el of elements) {
      if (el.boundaryId) {
        this.parentIndex.set(el.id, el.boundaryId);
      }
      if (el.type === 'code' && el.id.startsWith('file::')) {
        this.fileIndex.set(el.id, el.id);
      }
      if (el.children) {
        this.indexElements(el.children);
      }
    }
  }

  private resolveElementIds(absolutePath: string): string[] {
    if (!absolutePath.startsWith(this.workspaceRoot)) return [];

    const relPath = absolutePath.slice(this.workspaceRoot.length);
    const fileKey = `file::${relPath}`;
    if (!this.fileIndex.has(fileKey)) return [];

    const result: string[] = [fileKey];
    let current = fileKey;
    while (this.parentIndex.has(current)) {
      const parent = this.parentIndex.get(current)!;
      result.push(parent);
      current = parent;
    }
    return result;
  }

  private notifyChange(): void {
    const state = this.getState();
    for (const cb of this.changeCallbacks) {
      cb(state);
    }
  }
}
