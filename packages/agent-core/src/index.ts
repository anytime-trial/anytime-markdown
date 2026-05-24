export { ProviderRegistry } from './registry/ProviderRegistry';
export type {
  ProviderKind,
  ProviderRegistration,
  ChatProviderRegistration,
  EmbeddingProviderRegistration,
  ProviderRegistryChange,
  ProviderRegistryChangeType,
} from './registry/types';
export { HealthMonitor } from './health/HealthMonitor';
export type { HealthSnapshot } from './health/types';
export { UsageTracker } from './usage/UsageTracker';
export type { UsageRecord, ThresholdEvent } from './usage/types';
export { AgentChatSession } from './session/AgentChatSession';
export type { AgentChatSessionOptions } from './session/AgentChatSession';
export { DefaultModelRoutingPolicy } from './routing/DefaultModelRoutingPolicy';
export type { DefaultModelRoutingPolicyOptions } from './routing/DefaultModelRoutingPolicy';
export type { TaskKind, TaskRoute, ModelRoutingPolicy } from './routing/types';
export {
  classifySession,
  resolveWorktree,
  buildAgentMapping,
} from './mapping/agentMapping';
export { parseWorktreeList } from './mapping/parseWorktreeList';
export type {
  MappingState,
  SessionMapping,
  WorktreeEntry,
  WorktreeMapping,
} from './mapping/types';
export {
  createOllamaChatRegistration,
  createOllamaEmbeddingRegistration,
} from './adapters/OllamaAdapter';
export type {
  OllamaChatRegistrationOptions,
  OllamaEmbeddingRegistrationOptions,
} from './adapters/OllamaAdapter';

// agent-core is the sole direct dependent of ollama-core; consumers import
// these via agent-core so the backend can be swapped without touching call sites.
export {
  createOllamaClient,
  resolveOllamaBaseUrl,
  DEFAULT_OLLAMA_BASE_URL,
  OllamaChatProvider,
  OllamaEmbeddingProvider,
  OllamaThrottleGovernor,
  createThrottledOllamaClient,
} from '@anytime-markdown/ollama-core';
export type {
  OllamaClient,
  OllamaClientOptions,
  GenerateOptions,
  GenerateResult,
  EmbeddingsOptions,
  EmbeddingsResult,
  OllamaChatProviderOptions,
  OllamaEmbeddingProviderOptions,
  OllamaThrottleOptions,
  OllamaThrottleDeps,
  ThrottleState,
  OllamaOp,
} from '@anytime-markdown/ollama-core';
export { Emitter } from './util/Emitter';
export type { Disposable, Listener } from './util/Emitter';
