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
export { Emitter } from './util/Emitter';
export type { Disposable, Listener } from './util/Emitter';
