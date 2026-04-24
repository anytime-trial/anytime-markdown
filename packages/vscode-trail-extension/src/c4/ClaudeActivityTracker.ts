import type { C4Element, C4Model } from '@anytime-markdown/trail-core/c4';
import type { StatusChangeCallback, SessionEdit, AgentInfo } from '@anytime-markdown/vscode-common';
import type { FileConflict } from '../server/types';
import { TrailLogger } from '../utils/TrailLogger';

export interface AgentActivityEntry {
  readonly sessionId: string;
  readonly label: string;
  readonly branch: string;
  readonly currentFile: string;
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

export interface ClaudeActivityState {
  readonly activeElementIds: readonly string[];
  readonly touchedElementIds: readonly string[];
  readonly plannedElementIds: readonly string[];
}

export interface MultiAgentActivityState {
  /** 既存互換: 全エージェントの union */
  readonly merged: ClaudeActivityState;
  /** エージェント別の詳細 */
  readonly agents: readonly AgentActivityEntry[];
  /** ファイル衝突 */
  readonly conflicts: readonly FileConflict[];
}

type ActivityChangeCallback = (state: MultiAgentActivityState) => void;

interface PerAgentState {
  activeElementIds: string[];
  touchedElementIds: Set<string>;
  plannedElementIds: Set<string>;
  touchedFiles: Set<string>;
  branch: string;
  currentFile: string;
}

export class ClaudeActivityTracker {
  private fileIndex = new Map<string, string>();
  private parentIndex = new Map<string, string>();
  private agentStates = new Map<string, PerAgentState>();
  private agentOrder: string[] = [];
  private workspaceRoot = '';
  private readonly changeCallbacks: ActivityChangeCallback[] = [];

  setModel(model: C4Model, workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`;
    this.buildIndexes(model.elements);
  }

  /** マルチエージェントの状態を一括更新する */
  updateAgents(agents: ReadonlyMap<string, AgentInfo>): void {
    // 消えたエージェントを除去
    for (const sid of [...this.agentStates.keys()]) {
      if (!agents.has(sid)) {
        this.agentStates.delete(sid);
        this.agentOrder = this.agentOrder.filter((id) => id !== sid);
      }
    }

    for (const [sid, info] of agents) {
      let state = this.agentStates.get(sid);
      if (!state) {
        state = {
          activeElementIds: [],
          touchedElementIds: new Set(),
          plannedElementIds: new Set(),
          touchedFiles: new Set(),
          branch: '',
          currentFile: '',
        };
        this.agentStates.set(sid, state);
        this.agentOrder.push(sid);
      }

      state.branch = info.branch;
      state.currentFile = info.file;

      // active
      if (info.editing) {
        const ids = this.resolveElementIds(info.file);
        state.activeElementIds = ids;
        for (const id of ids) {
          state.touchedElementIds.add(id);
        }
      } else {
        state.activeElementIds = [];
      }

      // touched (restore from sessionEdits)
      for (const edit of info.sessionEdits) {
        state.touchedFiles.add(edit.file);
        const ids = this.resolveElementIds(edit.file);
        for (const id of ids) {
          state.touchedElementIds.add(id);
        }
      }

      // planned
      state.plannedElementIds.clear();
      for (const filePath of info.plannedEdits) {
        const ids = this.resolveElementIds(filePath);
        for (const id of ids) {
          state.plannedElementIds.add(id);
        }
      }
    }

    this.notifyChange();
  }

  /** 単一エージェントの editing コールバック（互換用） */
  readonly onFileEditing: StatusChangeCallback = (editing: boolean, filePath: string): void => {
    // マルチエージェントモードでは updateAgents が状態管理する
    if (this.agentStates.size > 0) return;

    const defaultSid = '__single__';
    let state = this.agentStates.get(defaultSid);
    if (!state) {
      state = {
        activeElementIds: [],
        touchedElementIds: new Set(),
        plannedElementIds: new Set(),
        touchedFiles: new Set(),
        branch: '',
        currentFile: '',
      };
      this.agentStates.set(defaultSid, state);
      this.agentOrder = [defaultSid];
    }

    if (!editing) {
      state.activeElementIds = [];
      this.notifyChange();
      return;
    }

    const ids = this.resolveElementIds(filePath);
    if (ids.length === 0) return;

    state.activeElementIds = ids;
    state.currentFile = filePath;
    for (const id of ids) {
      state.touchedElementIds.add(id);
    }
    this.notifyChange();
  };

  restoreSessionEdits(edits: readonly SessionEdit[]): void {
    const defaultSid = '__single__';
    let state = this.agentStates.get(defaultSid);
    if (!state) {
      state = {
        activeElementIds: [],
        touchedElementIds: new Set(),
        plannedElementIds: new Set(),
        touchedFiles: new Set(),
        branch: '',
        currentFile: '',
      };
      this.agentStates.set(defaultSid, state);
      this.agentOrder = [defaultSid];
    }
    for (const edit of edits) {
      const ids = this.resolveElementIds(edit.file);
      for (const id of ids) {
        state.touchedElementIds.add(id);
      }
    }
    if (state.touchedElementIds.size > 0) {
      this.notifyChange();
    }
  }

  setPlannedEdits(absolutePaths: readonly string[]): void {
    const defaultSid = '__single__';
    let state = this.agentStates.get(defaultSid);
    if (!state) {
      state = {
        activeElementIds: [],
        touchedElementIds: new Set(),
        plannedElementIds: new Set(),
        touchedFiles: new Set(),
        branch: '',
        currentFile: '',
      };
      this.agentStates.set(defaultSid, state);
      this.agentOrder = [defaultSid];
    }
    state.plannedElementIds.clear();
    for (const filePath of absolutePaths) {
      const ids = this.resolveElementIds(filePath);
      for (const id of ids) {
        state.plannedElementIds.add(id);
      }
    }
    this.notifyChange();
  }

  resetTouched(): void {
    this.agentStates.clear();
    this.agentOrder = [];
    this.notifyChange();
  }

  getMultiAgentState(): MultiAgentActivityState {
    const allActive = new Set<string>();
    const allTouched = new Set<string>();
    const allPlanned = new Set<string>();
    const agents: AgentActivityEntry[] = [];

    // 衝突検出用: ファイル → エージェント sessionId 集合
    const fileToAgents = new Map<string, Set<string>>();
    const fileActiveCount = new Map<string, number>();

    for (const sid of this.agentOrder) {
      const state = this.agentStates.get(sid);
      if (!state) continue;

      const idx = agents.length;
      const planned = [...state.plannedElementIds]
        .filter((id) => !state.touchedElementIds.has(id));

      agents.push({
        sessionId: sid,
        label: `Agent ${idx + 1}`,
        branch: state.branch,
        currentFile: state.currentFile,
        activeElementIds: [...state.activeElementIds],
        touchedElementIds: [...state.touchedElementIds],
        plannedElementIds: planned,
      });

      for (const id of state.activeElementIds) allActive.add(id);
      for (const id of state.touchedElementIds) allTouched.add(id);
      for (const id of planned) allPlanned.add(id);

      // 衝突検出: currentFile（editing 中）
      if (state.currentFile && state.activeElementIds.length > 0) {
        if (!fileToAgents.has(state.currentFile)) fileToAgents.set(state.currentFile, new Set());
        fileToAgents.get(state.currentFile)!.add(sid);
        fileActiveCount.set(state.currentFile, (fileActiveCount.get(state.currentFile) ?? 0) + 1);
      }

      // 衝突検出: touchedFiles（sessionEdits 累積）
      for (const file of state.touchedFiles) {
        if (!fileToAgents.has(file)) fileToAgents.set(file, new Set());
        fileToAgents.get(file)!.add(sid);
      }
    }

    // conflicts を構築（2エージェント以上が同一ファイルに関与）
    const conflicts: FileConflict[] = [];
    for (const [file, agentIds] of fileToAgents) {
      if (agentIds.size < 2) continue;
      const elementIds = this.resolveElementIds(file);
      conflicts.push({
        file,
        elementIds,
        agentSessionIds: [...agentIds],
        isActiveConflict: (fileActiveCount.get(file) ?? 0) >= 2,
      });
    }

    // planned から touched/active を除外（merged レベル）
    for (const id of allTouched) allPlanned.delete(id);
    for (const id of allActive) allPlanned.delete(id);

    return {
      merged: {
        activeElementIds: [...allActive],
        touchedElementIds: [...allTouched],
        plannedElementIds: [...allPlanned],
      },
      agents,
      conflicts,
    };
  }

  /** 後方互換: 旧 getState() と同じ形式 */
  getState(): ClaudeActivityState {
    return this.getMultiAgentState().merged;
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
    const state = this.getMultiAgentState();
    for (const cb of this.changeCallbacks) {
      cb(state);
    }
  }
}
