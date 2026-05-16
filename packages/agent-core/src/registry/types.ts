import type { ChatProvider, EmbeddingProvider } from '@anytime-markdown/llm-core';

export type ProviderKind = 'chat' | 'embedding';

export interface ChatProviderRegistration {
  readonly id: string;
  readonly kind: 'chat';
  readonly provider: ChatProvider;
}

export interface EmbeddingProviderRegistration {
  readonly id: string;
  readonly kind: 'embedding';
  readonly provider: EmbeddingProvider;
}

export type ProviderRegistration =
  | ChatProviderRegistration
  | EmbeddingProviderRegistration;

export type ProviderRegistryChangeType = 'register' | 'unregister' | 'activate';

export interface ProviderRegistryChange {
  readonly type: ProviderRegistryChangeType;
  readonly id: string;
  readonly kind: ProviderKind;
}
