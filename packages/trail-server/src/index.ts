export const TRAIL_SERVER_VERSION = '0.18.0';

export { TrailDataServer } from './server/TrailDataServer';
export { MemoryApiHandler } from './server/MemoryApiHandler';
export type * from './server/types';

export { CodeGraphService } from './analyze/CodeGraphService';
export { GraphQueryEngine } from './analyze/GraphQueryEngine';
export {
  findTsconfigCandidates,
  runAnalyzeCurrentCodePipeline,
  runAnalyzeReleaseCodePipeline,
} from './analyze/AnalyzePipeline';
export { computeAndPersistFileAnalysis } from './analyze/computeAndPersistFileAnalysis';
export type * from './analyze/CodeGraph.types';

export type { Disposable } from './runtime/Disposable';
export { DisposableStore } from './runtime/Disposable';

export { RebuildScheduler } from './memory-chat/rebuildScheduler';
export type { RebuildSchedulerLogger, RebuildSchedulerOptions } from './memory-chat/rebuildScheduler';

export { ChatBridge } from './memory-chat/chatBridge';
export type { ChatBridgeLogger, ChatBridgeConfig, ChatBridgeDeps } from './memory-chat/chatBridge';

export { installSqlJsLoaderOnce, createMemoryCoreRunner } from './runtime/memoryCoreRunner';
export type { MemoryCoreRunner, MemoryCoreOutputChannel } from './runtime/memoryCoreRunner';
