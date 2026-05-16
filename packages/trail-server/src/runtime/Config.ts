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

export interface AnalyzeAllConfig {
  intervalSec: number;
  runOnStart: boolean;
  startupDelaySec: number;
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

export interface ConversationMemoryConfig {
  backfillDays: number;
}

export interface MemoryConfig {
  ollama: OllamaMemoryConfig;
  chat: ChatMemoryConfig;
  embedding: EmbeddingMemoryConfig;
  rag: RagMemoryConfig;
  fts: FtsMemoryConfig;
  conversation: ConversationMemoryConfig;
}

export interface TrailServerConfig {
  schemaVersion: number;
  gitRoots: string[];
  docsPath?: string;
  scheduler: SchedulerConfig;
  analyzeAll: AnalyzeAllConfig;
  memory: MemoryConfig;
}

const DEFAULT_CONFIG: TrailServerConfig = {
  schemaVersion: 3,
  gitRoots: [],
  scheduler: {
    periodicImport: { intervalSec: 60, runOnStart: true, startupDelaySec: 5 },
    memoryCore: { intervalSec: 1800, runOnStart: true, startupDelaySec: 5 },
  },
  analyzeAll: { intervalSec: 1800, runOnStart: true, startupDelaySec: 5 },
  memory: {
    ollama: { baseUrl: 'http://localhost:11434' },
    chat: { model: 'qwen2.5-coder:14b' },
    embedding: { model: 'bge-m3' },
    rag: { bm25Limit: 30, vecLimit: 30, finalLimit: 12, rrfK: 60 },
    fts: { rebuildIntervalMinutes: 60 },
    conversation: { backfillDays: 5 },
  },
};

type PartialMemoryConfig = {
  ollama?: Partial<OllamaMemoryConfig>;
  chat?: Partial<ChatMemoryConfig>;
  embedding?: Partial<EmbeddingMemoryConfig>;
  rag?: Partial<RagMemoryConfig>;
  fts?: Partial<FtsMemoryConfig>;
  ingest?: Partial<AnalyzeAllConfig>;
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
  analyzeAll?: Partial<AnalyzeAllConfig>;
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
      `[${ts}] [WARN] Config: ${path} uses schemaVersion 1. Migrate to schemaVersion 3 by moving scheduler.memoryCore.* to top-level analyzeAll.*.`
    );
  } else if (overrides.schemaVersion === 2) {
    warn(
      `[${ts}] [WARN] Config: ${path} uses schemaVersion 2. Migrate to schemaVersion 3 by moving memory.ingest.* to top-level analyzeAll.*.`
    );
  }

  // v1 backward compat: migrate scheduler.memoryCore -> analyzeAll
  let migratedFromScheduler: Partial<AnalyzeAllConfig> | undefined;
  if (overrides.scheduler?.memoryCore !== undefined) {
    if (overrides.schemaVersion === 1) {
      warn(
        `[${ts}] [WARN] Config: scheduler.memoryCore is deprecated. Move these settings to top-level analyzeAll.* in ${path}.`
      );
    }
    const legacy = overrides.scheduler.memoryCore;
    migratedFromScheduler = {
      intervalSec: legacy.intervalSec,
      runOnStart: legacy.runOnStart,
      startupDelaySec: legacy.startupDelaySec,
    };
  }

  // v2 backward compat: migrate memory.ingest -> analyzeAll
  let migratedFromMemoryIngest: Partial<AnalyzeAllConfig> | undefined;
  if (overrides.memory?.ingest !== undefined) {
    if (overrides.schemaVersion === 2) {
      warn(
        `[${ts}] [WARN] Config: memory.ingest is deprecated. Move these settings to top-level analyzeAll.* in ${path}.`
      );
    }
    const legacy = overrides.memory.ingest;
    migratedFromMemoryIngest = {
      intervalSec: legacy.intervalSec,
      runOnStart: legacy.runOnStart,
      startupDelaySec: legacy.startupDelaySec,
    };
  }

  // Priority: explicit analyzeAll > v2 memory.ingest > v1 scheduler.memoryCore > defaults
  const userAnalyzeAll = overrides.analyzeAll;
  const analyzeAllBase = migratedFromMemoryIngest ?? migratedFromScheduler ?? {};

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
      memoryCore: {
        intervalSec: overrides.scheduler?.memoryCore?.intervalSec ?? defaults.scheduler.memoryCore.intervalSec,
        runOnStart: overrides.scheduler?.memoryCore?.runOnStart ?? defaults.scheduler.memoryCore.runOnStart,
        startupDelaySec: overrides.scheduler?.memoryCore?.startupDelaySec ?? defaults.scheduler.memoryCore.startupDelaySec,
      },
    },
    analyzeAll: {
      intervalSec: userAnalyzeAll?.intervalSec ?? analyzeAllBase.intervalSec ?? defaults.analyzeAll.intervalSec,
      runOnStart: userAnalyzeAll?.runOnStart ?? analyzeAllBase.runOnStart ?? defaults.analyzeAll.runOnStart,
      startupDelaySec: userAnalyzeAll?.startupDelaySec ?? analyzeAllBase.startupDelaySec ?? defaults.analyzeAll.startupDelaySec,
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
      conversation: {
        backfillDays: overrides.memory?.conversation?.backfillDays ?? defaults.memory.conversation.backfillDays,
      },
    },
  };
}
