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

export type { Logger, LogLevel } from './runtime/Logger';
export { ConsoleLogger, FileLogger } from './runtime/Logger';

export { loadConfig } from './runtime/Config';
export type { TrailServerConfig, SchedulerConfig, PeriodicImportConfig } from './runtime/Config';

export { DaemonScheduler } from './runtime/DaemonScheduler';
export type { ScheduledJob, JobResult } from './runtime/DaemonScheduler';

export { DaemonLifecycle } from './runtime/DaemonLifecycle';
export type { DaemonInfo, DaemonLifecycleOptions } from './runtime/DaemonLifecycle';

export { createPeriodicImportJob } from './jobs/PeriodicImportJob';
export type { PeriodicImportJobOptions } from './jobs/PeriodicImportJob';
