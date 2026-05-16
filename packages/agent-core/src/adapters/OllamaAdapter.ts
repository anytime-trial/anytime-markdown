import {
  OllamaChatProvider,
  OllamaEmbeddingProvider,
  type OllamaChatProviderOptions,
  type OllamaEmbeddingProviderOptions,
} from '@anytime-markdown/ollama-core';
import type {
  ChatProviderRegistration,
  EmbeddingProviderRegistration,
} from '../registry/types';

export interface OllamaChatRegistrationOptions extends OllamaChatProviderOptions {
  readonly id?: string;
}

export interface OllamaEmbeddingRegistrationOptions extends OllamaEmbeddingProviderOptions {
  readonly id?: string;
}

export function createOllamaChatRegistration(
  opts: OllamaChatRegistrationOptions
): ChatProviderRegistration {
  return {
    id: opts.id ?? `ollama-chat:${opts.model}`,
    kind: 'chat',
    provider: new OllamaChatProvider(opts),
  };
}

export function createOllamaEmbeddingRegistration(
  opts: OllamaEmbeddingRegistrationOptions
): EmbeddingProviderRegistration {
  return {
    id: opts.id ?? `ollama-embedding:${opts.model}`,
    kind: 'embedding',
    provider: new OllamaEmbeddingProvider(opts),
  };
}
