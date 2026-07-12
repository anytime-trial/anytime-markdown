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
  resolveSessionWorkspacePath,
  groupByWorkspace,
  ORPHAN_WORKTREE_PATH,
} from './mapping/agentMapping';
export type { WorkspaceGroup } from './mapping/agentMapping';
export { parseWorktreeList } from './mapping/parseWorktreeList';
export type {
  AgentSource,
  MappingState,
  SessionMapping,
  SessionLastCommit,
  WorktreeEntry,
  WorktreeMapping,
} from './mapping/types';
export {
  parseCodexSessionMeta,
  extractCodexContextTokens,
  extractCodexLastActivity,
} from './codex/parseCodexRollout';
export type { CodexSessionMeta } from './codex/parseCodexRollout';
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
  SummaryUpsertInput,
  AgentStatusEnvelope,
  AgentStatusListEnvelope,
} from './status/types';

// handoff（セッション引き継ぎ）: transcript の決定論抽出 → 圧縮ステート → レンダリング
export { parse as parseTranscript, parseLines } from './handoff/parseTranscript';
export { buildHandoffState } from './handoff/buildHandoff';
export { redact as redactSecrets } from './handoff/redact';
export { renderHandoffMarkdown, renderHandoffInjection } from './handoff/render';
export { generateHandoff, findTranscriptPath } from './handoff/generate';
export type { GeneratedHandoff, GenerateHandoffOptions } from './handoff/generate';
export { HANDOFF_VERSION } from './handoff/types';
export type {
  HandoffState,
  HandoffStructured,
  TranscriptEvent,
} from './handoff/types';
export type { BuildHandoffOptions } from './handoff/buildHandoff';

// サブエージェント回転 / 毎タスク compact-seed（RFC 用途 (b)/(c)）の純粋ヘルパ（runtime 非依存）。
export {
  shouldRotate,
  buildSeedPrompt,
  parseRunningState,
  buildReturnContract,
  DEFAULT_ROTATION_THRESHOLD,
} from './handoff/rotation';
export type { RotationPolicy } from './handoff/rotation';
