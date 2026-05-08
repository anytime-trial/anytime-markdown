import type { OpenMode, SchemaInfo, DatabaseCapabilities } from './types';

export type RpcMethod =
  | 'listSchema'
  | 'selectRows'
  | 'countRows'
  | 'executeSql'
  | 'save'
  | 'revert';

export interface RpcRequest {
  readonly type: 'rpc';
  readonly id: string;
  readonly method: RpcMethod;
  readonly params: unknown;
}

export interface RpcResultMessage {
  readonly type: 'rpcResult';
  readonly id: string;
  readonly result?: unknown;
  readonly error?: { readonly message: string };
}

export interface InitMessage {
  readonly type: 'init';
  readonly capabilities: DatabaseCapabilities;
  readonly schema: SchemaInfo;
  readonly config: { readonly queryMaxRows: number; readonly openMode: OpenMode; readonly fileName: string };
}

export interface MarkDirtyMessage { readonly type: 'markDirty' }
export interface RequestSaveMessage { readonly type: 'requestSave' }
export interface SaveAckMessage { readonly type: 'saveAck' }
export interface RequestRevertMessage { readonly type: 'requestRevert' }
export interface RevertAckMessage { readonly type: 'revertAck' }
export interface ConfigChangedMessage {
  readonly type: 'configChanged';
  readonly config: { readonly queryMaxRows: number };
}
export interface ReadyMessage { readonly type: 'ready' }

export type ExtToWvMessage =
  | InitMessage | RpcResultMessage | RequestSaveMessage | RequestRevertMessage | ConfigChangedMessage;

export type WvToExtMessage =
  | ReadyMessage | RpcRequest | MarkDirtyMessage | SaveAckMessage | RevertAckMessage;

/** transport: WebView 側からは acquireVsCodeApi().postMessage、Extension 側は webviewPanel.webview.postMessage */
export interface MessageTransport {
  postMessage(msg: WvToExtMessage | ExtToWvMessage): void;
  onMessage(listener: (msg: WvToExtMessage | ExtToWvMessage) => void): () => void;
}

export function makeRpcId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
