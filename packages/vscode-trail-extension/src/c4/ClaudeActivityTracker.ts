import type { C4Element, C4Model } from '@anytime-markdown/trail-core/c4';
import type { StatusChangeCallback } from '@anytime-markdown/vscode-common';

export interface ClaudeActivityState {
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
}

type ActivityChangeCallback = (state: ClaudeActivityState) => void;

export class ClaudeActivityTracker {
  /** file::relPath → elementId（code 要素） */
  private fileIndex = new Map<string, string>();
  /** elementId → parentId（boundaryId チェーン） */
  private parentIndex = new Map<string, string>();

  private activeElementIds: string[] = [];
  private touchedElementIds = new Set<string>();
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
    if (ids.length === 0) return;

    this.activeElementIds = ids;
    for (const id of ids) {
      this.touchedElementIds.add(id);
    }
    this.notifyChange();
  };

  resetTouched(): void {
    this.activeElementIds = [];
    this.touchedElementIds.clear();
    this.notifyChange();
  }

  getState(): ClaudeActivityState {
    return {
      activeElementIds: [...this.activeElementIds],
      touchedElementIds: [...this.touchedElementIds],
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
