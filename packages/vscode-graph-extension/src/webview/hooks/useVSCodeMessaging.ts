import { useEffect, useRef, useCallback } from 'react';
import type { GraphDocument } from '@anytime-markdown/graph-core';

interface VSCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

let vscodeApi: VSCodeApi | null = null;

function getVSCodeApi(): VSCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

interface UseVSCodeMessagingOptions {
  onLoad: (doc: GraphDocument) => void;
  onTheme: (kind: 'light' | 'dark') => void;
}

export function useVSCodeMessaging({ onLoad, onTheme }: UseVSCodeMessagingOptions) {
  const onLoadRef = useRef(onLoad);
  const onThemeRef = useRef(onTheme);
  onLoadRef.current = onLoad;
  onThemeRef.current = onTheme;

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // VS Code webview のメッセージは origin が空文字列または vscode-webview:// スキーム
      if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
      const message = event.data;
      switch (message.type) {
        case 'load':
          onLoadRef.current(message.document);
          break;
        case 'theme':
          onThemeRef.current(message.kind);
          break;
      }
    };
    window.addEventListener('message', handler);

    // Notify extension that webview is ready
    getVSCodeApi().postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const saveDocument = useCallback((doc: GraphDocument) => {
    getVSCodeApi().postMessage({ type: 'update', document: { ...doc, updatedAt: Date.now() } });
  }, []);

  return { saveDocument };
}
