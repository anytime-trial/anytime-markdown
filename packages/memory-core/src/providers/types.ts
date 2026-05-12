import type { ChatMessage } from '../chat/types';

export interface HealthCheckResult {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: ReadonlyArray<string>, signal?: AbortSignal): Promise<Float32Array[]>;
  healthCheck(): Promise<HealthCheckResult>;
}

export interface ChatStreamChunk {
  readonly delta: string;
  readonly done: boolean;
}

export interface ChatProviderChatOptions {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly temperature?: number;
  readonly signal?: AbortSignal;
}

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  chat(opts: ChatProviderChatOptions): AsyncGenerator<ChatStreamChunk>;
  healthCheck(): Promise<HealthCheckResult>;
}
