// agent-core: multi-LLM agent state management
// - ProviderRegistry: backend registration and active provider selection
// - HealthMonitor: per-backend availability state (Phase 2-2)
// - UsageTracker: call count and token usage aggregation (Phase 2-3)
// - AgentChatSession: conversation history and model preference (Phase 2-4)
// - ModelRoutingPolicy: per-task default model selection (Phase 2-5)
// - mapping: agent session x worktree classification (Phase 3, relocated from trail-core)
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
export type {
  MappingState,
  SessionMapping,
  WorktreeEntry,
  WorktreeMapping,
} from './mapping/types';
export { Emitter } from './util/Emitter';
export type { Disposable, Listener } from './util/Emitter';
