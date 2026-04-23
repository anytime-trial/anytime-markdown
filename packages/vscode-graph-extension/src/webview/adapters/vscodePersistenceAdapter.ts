import type { GraphDocument, GraphEdge, GraphNode } from '@anytime-markdown/graph-core';
import type { PersistenceAdapter, SaveStatus } from '@anytime-markdown/graph-viewer';

interface VSCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

let vscodeApi: VSCodeApi | null = null;

function getVSCodeApi(): VSCodeApi {
  vscodeApi ??= acquireVsCodeApi();
  return vscodeApi;
}

interface ContentSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  name: string;
  groups: GraphDocument['groups'];
}

function snapshotContent(doc: GraphDocument): ContentSnapshot {
  return { nodes: doc.nodes, edges: doc.edges, name: doc.name, groups: doc.groups };
}

function isSameContent(a: ContentSnapshot, b: ContentSnapshot): boolean {
  return a.nodes === b.nodes && a.edges === b.edges && a.name === b.name && a.groups === b.groups;
}

export function createVSCodePersistenceAdapter(): PersistenceAdapter & {
  dispose: () => void;
} {
  let status: SaveStatus = 'saved';
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  // 初回 'load' 到着前に save を発火させない（空の初期ドキュメントでファイルを上書きしないため）
  let lastPersisted: ContentSnapshot | null = null;

  const loadInitial = () => new Promise<GraphDocument | null>((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
      if (event.data?.type === 'load') {
        globalThis.removeEventListener('message', handler);
        const doc: GraphDocument | null = event.data.document ?? null;
        if (doc) lastPersisted = snapshotContent(doc);
        resolve(doc);
      }
    };
    globalThis.addEventListener('message', handler);
    getVSCodeApi().postMessage({ type: 'ready' });
  });

  const save = (doc: GraphDocument) => {
    if (saveTimer) clearTimeout(saveTimer);
    status = 'saving';
    const snapshot = snapshotContent(doc);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      // viewport のみの変更（pan / zoom）ではファイルを dirty にしない
      if (!lastPersisted || isSameContent(lastPersisted, snapshot)) {
        status = 'saved';
        return;
      }
      try {
        getVSCodeApi().postMessage({
          type: 'update',
          document: { ...doc, updatedAt: Date.now() },
        });
        lastPersisted = snapshot;
        status = 'saved';
      } catch (e) {
        status = 'error';
        console.error('[vscode-graph-extension] save failed:', e);
      }
    }, 500);
  };

  const dispose = () => {
    if (saveTimer) clearTimeout(saveTimer);
  };

  return { loadInitial, save, get status() { return status; }, dispose };
}
