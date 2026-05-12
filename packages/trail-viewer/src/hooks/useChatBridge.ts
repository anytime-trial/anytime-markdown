import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChatBridgeStatus {
  readonly status: 'ready' | 'unavailable' | 'unknown';
  readonly detail?: string;
}

export interface ChatBridgeHandlers {
  readonly onChunk: (chunk: unknown) => void;
  readonly onStatus: (s: ChatBridgeStatus) => void;
}

export interface ChatBridge extends ChatBridgeStatus {
  subscribe(handler: (chunk: unknown) => void): () => void;
  send(query: string): void;
  abort(): void;
  recheck(): void;
}

interface VsCodeApi {
  postMessage(msg: unknown): void;
}

declare const acquireVsCodeApi: (() => VsCodeApi) | undefined;

interface WindowWithVsCode {
  __vscode?: VsCodeApi;
  __chatHandlers?: Set<(chunk: unknown) => void>;
}

function getVsCodeApi(): VsCodeApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as WindowWithVsCode;
  if (w.__vscode) return w.__vscode;
  if (typeof acquireVsCodeApi !== 'function') return null;
  w.__vscode = acquireVsCodeApi();
  return w.__vscode;
}

function getHandlerSet(): Set<(chunk: unknown) => void> {
  if (typeof window === 'undefined') return new Set();
  const w = window as unknown as WindowWithVsCode;
  if (!w.__chatHandlers) w.__chatHandlers = new Set();
  return w.__chatHandlers;
}

export function useChatBridge(): ChatBridge {
  const [status, setStatus] = useState<ChatBridgeStatus['status']>('unknown');
  const [detail, setDetail] = useState<string | undefined>();
  const handlersRef = useRef(getHandlerSet());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (ev: MessageEvent): void => {
      const msg = ev.data as { type?: string; [k: string]: unknown };
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'provider.status') {
        setStatus((msg.status as ChatBridgeStatus['status']) ?? 'unknown');
        setDetail(msg.detail as string | undefined);
      } else if (msg.type === 'chat.chunk') {
        for (const h of handlersRef.current) h(msg.chunk);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const subscribe = useCallback((h: (chunk: unknown) => void) => {
    handlersRef.current.add(h);
    return () => {
      handlersRef.current.delete(h);
    };
  }, []);

  const send = useCallback((query: string) => {
    const api = getVsCodeApi();
    api?.postMessage({ type: 'chat.send', query });
  }, []);

  const abort = useCallback(() => {
    const api = getVsCodeApi();
    api?.postMessage({ type: 'chat.abort' });
  }, []);

  const recheck = useCallback(() => {
    const api = getVsCodeApi();
    api?.postMessage({ type: 'provider.recheck' });
  }, []);

  return { status, detail, subscribe, send, abort, recheck };
}
