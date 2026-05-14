import { existsSync, readFileSync } from 'node:fs';
import type { Logger } from './Logger';

export interface PeriodicImportConfig {
  intervalSec: number;
  runOnStart: boolean;
  startupDelaySec: number;
}

export interface MemoryCoreSchedulerConfig {
  intervalSec: number;
  runOnStart: boolean;
  startupDelaySec: number;
}

export interface SchedulerConfig {
  periodicImport: PeriodicImportConfig;
  memoryCore: MemoryCoreSchedulerConfig;
}

export interface OllamaMemoryConfig {
  baseUrl: string;
}

export interface ChatMemoryConfig {
  model: string;
}

export interface EmbeddingMemoryConfig {
  model: string;
}

export interface RagMemoryConfig {
  bm25Limit: number;
  vecLimit: number;
  finalLimit: number;
  rrfK: number;
}

export interface FtsMemoryConfig {
  rebuildIntervalMinutes: number;
}

export interface IngestMemoryConfig {
  intervalSec: number;
  runOnStart: boolean;
  startupDelaySec: number;
}

export interface ConversationMemoryConfig {
  backfillDays: number;
}

export interface MemoryConfig {
  ollama: OllamaMemoryConfig;
  chat: ChatMemoryConfig;
  embedding: EmbeddingMemoryConfig;
  rag: RagMemoryConfig;
  fts: FtsMemoryConfig;
  ingest: IngestMemoryConfig;
  conversation: ConversationMemoryConfig;
}

export interface TrailServerConfig {
  schemaVersion: number;
  gitRoots: string[];
  docsPath?: string;
  scheduler: SchedulerConfig;
  memory: MemoryConfig;
}

const DEFAULT_CONFIG: TrailServerConfig = {
  schemaVersion: 2,
  gitRoots: [],
  scheduler: {
    periodicImport: { intervalSec: 60, runOnStart: true, startupDelaySec: 5 },
    memoryCore: { intervalSec: 1800, runOnStart: true, startupDelaySec: 5 },
  },
  memory: {
    ollama: { baseUrl: 'http://localhost:11434' },
    chat: { model: 'qwen2.5-coder:14b' },
    embedding: { model: 'bge-m3' },
    rag: { bm25Limit: 30, vecLimit: 30, finalLimit: 12, rrfK: 60 },
    fts: { rebuildIntervalMinutes: 60 },
    ingest: { intervalSec: 1800, runOnStart: true, startupDelaySec: 5 },
    conversation: { backfillDays: 5 },
  },
};

type PartialMemoryConfig = {
  ollama?: Partial<OllamaMemoryConfig>;
  chat?: Partial<ChatMemoryConfig>;
  embedding?: Partial<EmbeddingMemoryConfig>;
  rag?: Partial<RagMemoryConfig>;
  fts?: Partial<FtsMemoryConfig>;
  ingest?: Partial<IngestMemoryConfig>;
  conversation?: Partial<ConversationMemoryConfig>;
};

type ParsedConfig = {
  schemaVersion?: number;
  gitRoots?: string[];
  docsPath?: string;
  scheduler?: {
    periodicImport?: Partial<PeriodicImportConfig>;
    memoryCore?: Partial<MemoryCoreSchedulerConfig>;
  };
  memory?: PartialMemoryConfig;
};

export function loadConfig(path: string, logger?: Pick<Logger, 'warn'>): TrailServerConfig {
  if (!existsSync(path)) return DEFAULT_CONFIG;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as ParsedConfig;
    return mergeConfig(DEFAULT_CONFIG, parsed, path, logger);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const warn = logger ? logger.warn.bind(logger) : console.warn;
    warn(`[Config] failed to parse ${path}: ${message}. Using DEFAULT_CONFIG.`);
    return DEFAULT_CONFIG;
  }
}

function mergeConfig(
  defaults: TrailServerConfig,
  overrides: ParsedConfig,
  path: string,
  logger?: Pick<Logger, 'warn'>,
): TrailServerConfig {
  const ts = new Date().toISOString();
  const warn = (msg: string) => logger ? logger.warn(msg) : console.warn(msg);

  if (overrides.schemaVersion === 1) {
    warn(
      `[${ts}] [WARN] Config: ${path} uses schemaVersion 1. Migrate to schemaVersion 2 by moving scheduler.memoryCore.* to memory.ingest.*.`
    );
  }

  // v1 backward compat: migrate scheduler.memoryCore -> memory.ingest (only where not explicitly set)
  // This migration block can be removed once all users have migrated to schemaVersion 2.
  let migratedIngest: Partial<IngestMemoryConfig> | undefined;
  if (overrides.scheduler?.memoryCore !== undefined) {
    if (overrides.schemaVersion === 1) {
      warn(
        `[${ts}] [WARN] Config: scheduler.memoryCore is deprecated. Move these settings to memory.ingest in ${path}.`
      );
    }
    const legacy = overrides.scheduler.memoryCore;
    migratedIngest = {
      intervalSec: legacy.intervalSec,
      runOnStart: legacy.runOnStart,
      startupDelaySec: legacy.startupDelaySec,
    };
  }

  // Explicit memory.ingest from user overrides take priority over migrated values
  const userIngest = overrides.memory?.ingest;
  const ingestBase = migratedIngest ?? {};

  return {
    schemaVersion: overrides.schemaVersion ?? defaults.schemaVersion,
    gitRoots: overrides.gitRoots ?? defaults.gitRoots,
    docsPath: overrides.docsPath ?? defaults.docsPath,
    scheduler: {
      periodicImport: {
        intervalSec: overrides.scheduler?.periodicImport?.intervalSec ?? defaults.scheduler.periodicImport.intervalSec,
        runOnStart: overrides.scheduler?.periodicImport?.runOnStart ?? defaults.scheduler.periodicImport.runOnStart,
        startupDelaySec: overrides.scheduler?.periodicImport?.startupDelaySec ?? defaults.scheduler.periodicImport.startupDelaySec,
      },
      // Kept for backward compat during Task 4 migration; remove once cli.ts switches to memory.ingest.*
      memoryCore: {
        intervalSec: overrides.scheduler?.memoryCore?.intervalSec ?? defaults.scheduler.memoryCore.intervalSec,
        runOnStart: overrides.scheduler?.memoryCore?.runOnStart ?? defaults.scheduler.memoryCore.runOnStart,
        startupDelaySec: overrides.scheduler?.memoryCore?.startupDelaySec ?? defaults.scheduler.memoryCore.startupDelaySec,
      },
    },
    memory: {
      ollama: {
        baseUrl: overrides.memory?.ollama?.baseUrl ?? defaults.memory.ollama.baseUrl,
      },
      chat: {
        model: overrides.memory?.chat?.model ?? defaults.memory.chat.model,
      },
      embedding: {
        model: overrides.memory?.embedding?.model ?? defaults.memory.embedding.model,
      },
      rag: {
        bm25Limit: overrides.memory?.rag?.bm25Limit ?? defaults.memory.rag.bm25Limit,
        vecLimit: overrides.memory?.rag?.vecLimit ?? defaults.memory.rag.vecLimit,
        finalLimit: overrides.memory?.rag?.finalLimit ?? defaults.memory.rag.finalLimit,
        rrfK: overrides.memory?.rag?.rrfK ?? defaults.memory.rag.rrfK,
      },
      fts: {
        rebuildIntervalMinutes: overrides.memory?.fts?.rebuildIntervalMinutes ?? defaults.memory.fts.rebuildIntervalMinutes,
      },
      ingest: {
        intervalSec: userIngest?.intervalSec ?? ingestBase.intervalSec ?? defaults.memory.ingest.intervalSec,
        runOnStart: userIngest?.runOnStart ?? ingestBase.runOnStart ?? defaults.memory.ingest.runOnStart,
        startupDelaySec: userIngest?.startupDelaySec ?? ingestBase.startupDelaySec ?? defaults.memory.ingest.startupDelaySec,
      },
      conversation: {
        backfillDays: overrides.memory?.conversation?.backfillDays ?? defaults.memory.conversation.backfillDays,
      },
    },
  };
}
