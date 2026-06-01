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
  ThrottleSnapshot,
  ThrottleSnapshotEntry,
} from '@anytime-markdown/ollama-core';
export { Emitter } from './util/Emitter';
export type { Disposable, Listener } from './util/Emitter';

// agent-status: ワーカー単一所有モデルのステータスストア／クライアント。
// AgentStatusStore / AgentStatusWorker は node:sqlite を import するためワーカープロセス専用。
// AgentStatusClient は SQLite 非依存で、どの拡張からも import 一行で利用できる公開 API。
export { AgentStatusClient } from './status/AgentStatusClient';
export type { AgentStatusClientOptions } from './status/AgentStatusClient';
export {
  agentWorkerJsonPath,
  agentStatusDbPath,
  readWorkerInfo,
  writeWorkerInfo,
  removeWorkerInfo,
  isWorkerAlive,
  AGENT_WORKER_SCHEMA_VERSION,
} from './status/agentWorkerInfo';
export { AgentStatusStore } from './status/AgentStatusStore';
export { AgentStatusWorker } from './status/AgentStatusWorker';
export { runWorker } from './status/agentStatusWorkerMain';
export { AGENT_STATUS_API_VERSION } from './status/types';
export type {
  AgentSessionRow,
  AgentSessionEdit,
  AgentLastCommit,
  AgentWorkerInfo,
  EditUpsertInput,
  CommitUpsertInput,
  AgentStatusEnvelope,
  AgentStatusListEnvelope,
} from './status/types';
