import type { GraphDocument } from '@anytime-markdown/graph-core';
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

export function createVSCodePersistenceAdapter(): PersistenceAdapter & {
  dispose: () => void;
} {
  let status: SaveStatus = 'saved';
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const loadInitial = () => new Promise<GraphDocument | null>((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
      if (event.data?.type === 'load') {
        globalThis.removeEventListener('message', handler);
        resolve(event.data.document ?? null);
      }
    };
    globalThis.addEventListener('message', handler);
    getVSCodeApi().postMessage({ type: 'ready' });
  });

  const save = (doc: GraphDocument) => {
    if (saveTimer) clearTimeout(saveTimer);
    status = 'saving';
    saveTimer = setTimeout(() => {
      try {
        getVSCodeApi().postMessage({
          type: 'update',
          document: { ...doc, updatedAt: Date.now() },
        });
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
