import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_CONVERSATION_BACKFILL_DAYS } from '@anytime-markdown/memory-core';
import type { Logger } from './Logger';

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
  analyzeAll: AnalyzeAllConfig;
  memory: MemoryConfig;
}

const DEFAULT_CONFIG: TrailServerConfig = {
  schemaVersion: 1,
  gitRoots: [],
  analyzeAll: { intervalSec: 1800, runOnStart: false, startupDelaySec: 30 },
  memory: {
    ollama: { baseUrl: 'http://localhost:11434' },
    chat: { model: 'qwen2.5-coder:14b' },
    embedding: { model: 'bge-m3' },
    rag: { bm25Limit: 30, vecLimit: 30, finalLimit: 12, rrfK: 60 },
    fts: { rebuildIntervalMinutes: 60 },
    conversation: { backfillDays: DEFAULT_CONVERSATION_BACKFILL_DAYS },
  },
};

type ParsedConfig = {
  schemaVersion?: number;
  gitRoots?: string[];
  docsPath?: string;
  analyzeAll?: Partial<AnalyzeAllConfig>;
  memory?: {
    ollama?: Partial<OllamaMemoryConfig>;
    chat?: Partial<ChatMemoryConfig>;
    embedding?: Partial<EmbeddingMemoryConfig>;
    rag?: Partial<RagMemoryConfig>;
    fts?: Partial<FtsMemoryConfig>;
    conversation?: Partial<ConversationMemoryConfig>;
  };
};

/**
 * config.json を読み込む。ファイル不在時は DEFAULT_CONFIG を**自動でディスクに書き出してから**
 * 返す (副作用)。ユーザーが手で編集できる初期ファイルを提供するため。
 *
 * 書き込み失敗 (権限不足等) は WARN ログを出して in-memory DEFAULT_CONFIG にフォールバック。
 * 不明 / 旧スキーマのフィールドは silently ignore (マイグレーションロジックは持たない)。
 */
export function loadConfig(path: string, logger?: Pick<Logger, 'warn'>): TrailServerConfig {
  const warn = (msg: string): void => {
    if (logger) logger.warn(msg);
    else console.warn(msg);
  };

  // ファイル不在時は DEFAULT_CONFIG を書き出す。existsSync → writeFileSync の TOCTOU
  // (CodeQL `js/file-system-race`) を `flag: 'wx'` (排他作成) で回避する。
  // EEXIST は他のプロセスが先に書いた状態なので、続けて読み込みへフォールスルー。
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', {
      encoding: 'utf-8',
      flag: 'wx',
    });
    return DEFAULT_CONFIG;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      warn(
        `[Config] failed to generate default ${path}: ${
          err instanceof Error ? err.message : String(err)
        }. Using in-memory DEFAULT_CONFIG.`,
      );
      return DEFAULT_CONFIG;
    }
    // EEXIST → 既存ファイルを読み込みへ
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as ParsedConfig;
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`[Config] failed to parse ${path}: ${message}. Using DEFAULT_CONFIG.`);
    return DEFAULT_CONFIG;
  }
}

function mergeConfig(defaults: TrailServerConfig, overrides: ParsedConfig): TrailServerConfig {
  return {
    schemaVersion: overrides.schemaVersion ?? defaults.schemaVersion,
    gitRoots: overrides.gitRoots ?? defaults.gitRoots,
    docsPath: overrides.docsPath ?? defaults.docsPath,
    analyzeAll: {
      intervalSec: overrides.analyzeAll?.intervalSec ?? defaults.analyzeAll.intervalSec,
      runOnStart: overrides.analyzeAll?.runOnStart ?? defaults.analyzeAll.runOnStart,
      startupDelaySec: overrides.analyzeAll?.startupDelaySec ?? defaults.analyzeAll.startupDelaySec,
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
