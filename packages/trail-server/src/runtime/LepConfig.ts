import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { DEFAULT_CONVERSATION_BACKFILL_DAYS, LEP_STAGES, type LepStage } from '@anytime-markdown/memory-core';

import type { Logger } from './Logger';

/**
 * LEP 設定ファイル (`lep.json`) のスキーマ・loader・バリデーション・旧設定 migration。
 *
 * 設計書 13 章 (設定ファイルによる切替) の Step 3 範囲サブセットを実装する。
 * `ingesters` / `database` / `daemon` / `eventBus` / `chunking` 等の後続セクションは
 * 本 Step では導入せず、未知キーは warn してスキップする前方互換 loader とする。
 */

/** lep.json の現行スキーマバージョン。不一致は fatal (起動中止)。 */
export const LEP_CONFIG_VERSION = 1;

/** Step 3 で扱う Layer 3 (memory) analyzer 7 種の ID。 */
export const MEMORY_ANALYZER_IDS = [
  'ConversationMemoryAnalyzer',
  'CodeMemoryAnalyzer',
  'BugHistoryMemoryAnalyzer',
  'ReviewFindingMemoryAnalyzer',
  'SpecMemoryAnalyzer',
  'DriftMemoryAnalyzer',
  'EmbeddingBackfillAnalyzer',
] as const;

export type MemoryAnalyzerId = (typeof MEMORY_ANALYZER_IDS)[number];

/**
 * Step 4 で扱う Layer 4 (aggregator) analyzer の ID。
 * tier=4 は `stage='all'` でのみ実行される (opt-in)。`CrossSourceCorrelator` は Step 4d で追加。
 */
export const AGGREGATOR_ANALYZER_IDS = ['DoraMetricsAggregator', 'CrossSourceCorrelator'] as const;

export type AggregatorAnalyzerId = (typeof AGGREGATOR_ANALYZER_IDS)[number];

/** lep.json `analyzers` で toggle 可能な全 analyzer ID (memory + aggregator)。バリデーションに使う。 */
export const KNOWN_ANALYZER_IDS: readonly string[] = [
  ...MEMORY_ANALYZER_IDS,
  ...AGGREGATOR_ANALYZER_IDS,
];

export type LepLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LepScheduleConfig {
  intervalSec: number;
  runOnStart: boolean;
  startupDelaySec: number;
}

export interface LepOllamaProviderConfig {
  baseUrl: string;
  models: { chat: string; embedding: string };
}

export interface LepLlmConfig {
  providers: { ollama: LepOllamaProviderConfig };
}

/** ハイブリッド検索 (BM25 + ベクトル + RRF) のリミット。memory-chat / RAG が消費する。 */
export interface LepRagConfig {
  bm25Limit: number;
  vecLimit: number;
  finalLimit: number;
  rrfK: number;
}

/** FTS5 インデックス再構築スケジュール。 */
export interface LepFtsConfig {
  rebuildIntervalMinutes: number;
}

/** 会話取込の初回 backfill 期間。 */
export interface LepConversationConfig {
  backfillDays: number;
}

/** memory-core 取込・検索のパラメータ群 (旧 config.json `memory.*` から統合)。 */
export interface LepMemoryConfig {
  rag: LepRagConfig;
  fts: LepFtsConfig;
  conversation: LepConversationConfig;
}

export interface LepAnalyzerToggle {
  enabled: boolean;
}

export type LepAnalyzersConfig = Record<string, LepAnalyzerToggle>;

/**
 * GitHub PR review source 設定 (Step 4b)。opt-in (デフォルト無効)。
 * token は `tokenEnv` で指定した環境変数から読む (lep.json への直書き禁止)。
 */
export interface LepGitHubSourceConfig {
  enabled: boolean;
  /** token を読む環境変数名。 */
  tokenEnv: string;
  /** 1 repo あたり走査する PR 数上限。 */
  maxPrs: number;
  /** 取込下限の submitted_at (ISO 8601 + Z)。空文字 = 制限なし。 */
  since: string;
}

/**
 * Claude Code セッションログ (JSONL) の探索元。`projectsDir` 空文字は「未指定」とし、
 * JsonlIngester の既定 (`os.homedir()/.claude/projects`) にフォールバックする。
 */
export interface LepClaudeSourceConfig {
  projectsDir: string;
}

/**
 * Codex セッションログ (rollout JSONL) の探索元。`sessionsDir` 空文字は「未指定」とし、
 * JsonlIngester の既定 (`os.homedir()/.codex/sessions`) にフォールバックする。
 */
export interface LepCodexSourceConfig {
  sessionsDir: string;
}

export interface LepSourcesConfig {
  github: LepGitHubSourceConfig;
  claude: LepClaudeSourceConfig;
  codex: LepCodexSourceConfig;
  /**
   * 解析対象 git リポジトリのルート群 (拡張・daemon 共通の監視対象)。
   * daemon は CLI 引数 → home-tier lep.json の順で bootstrap する (workspace lep.json は
   * gitRoots 解決後でないと読めないため非参照)。
   * 拡張は本 gitRoots に加えて anytimeTrail.workspace.path を監視対象へ追加する。
   */
  gitRoots: string[];
}

export interface LepConfig {
  version: number;
  stage: LepStage;
  schedule: LepScheduleConfig;
  llm: LepLlmConfig;
  memory: LepMemoryConfig;
  analyzers: LepAnalyzersConfig;
  sources: LepSourcesConfig;
  logs: { minLevel: LepLogLevel };
}

/** 解決済み GitHub source。token は env から解決後の実値 (無ければ null)。 */
export interface ResolvedGitHubSource {
  enabled: boolean;
  /** env から解決した token。enabled でも env 未設定なら null (Ingester は skip)。 */
  token: string | null;
  maxPrs: number;
  /** 空文字は undefined に正規化 (since 制限なし)。 */
  since?: string;
}

/**
 * `lep.json` の `sources.github` と環境変数から実行時の GitHub source 設定を解決する。
 * `enabled:false` または token 未設定なら `token:null` を返し、Ingester は skip する。
 */
export function resolveGitHubSource(
  config: LepConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedGitHubSource {
  const gh = config.sources.github;
  const token = gh.enabled ? (env[gh.tokenEnv]?.trim() || null) : null;
  return {
    enabled: gh.enabled,
    token,
    maxPrs: gh.maxPrs,
    since: gh.since ? gh.since : undefined,
  };
}

/**
 * `lep.json` の `analyzers.<id>.enabled === false` な analyzer id 一覧を返す
 * (memory / aggregator を区別せず全 disabled id)。AnalyzeAllRunner の
 * `disabledMemoryAnalyzers` / `disabledAggregators` 両方にそのまま渡してよい。
 */
export function disabledAnalyzerIds(config: LepConfig): string[] {
  return Object.entries(config.analyzers)
    .filter(([, toggle]) => toggle.enabled === false)
    .map(([id]) => id);
}

/** @deprecated {@link disabledAnalyzerIds} を使う (memory に限らず全 disabled id を返す)。 */
export const disabledMemoryAnalyzerIds = disabledAnalyzerIds;

/** 部分指定 (ファイル中の override や migration の出力) を表す deep partial。 */
export interface PartialLepConfig {
  version?: number;
  stage?: LepStage;
  schedule?: Partial<LepScheduleConfig>;
  llm?: {
    providers?: {
      ollama?: {
        baseUrl?: string;
        models?: Partial<LepOllamaProviderConfig['models']>;
      };
    };
  };
  memory?: {
    rag?: Partial<LepRagConfig>;
    fts?: Partial<LepFtsConfig>;
    conversation?: Partial<LepConversationConfig>;
  };
  analyzers?: LepAnalyzersConfig;
  sources?: {
    github?: Partial<LepGitHubSourceConfig>;
    claude?: Partial<LepClaudeSourceConfig>;
    codex?: Partial<LepCodexSourceConfig>;
    gitRoots?: string[];
  };
  logs?: { minLevel?: LepLogLevel };
}

/** 内蔵 default schema (tier 4)。stage は安全側に `disabled` (設計書 9 章)。 */
export const DEFAULT_LEP_CONFIG: LepConfig = {
  version: LEP_CONFIG_VERSION,
  stage: 'disabled',
  schedule: { intervalSec: 1800, runOnStart: false, startupDelaySec: 30 },
  llm: {
    providers: {
      ollama: {
        baseUrl: 'http://localhost:11434',
        models: { chat: 'qwen2.5-coder:14b', embedding: 'bge-m3' },
      },
    },
  },
  memory: {
    rag: { bm25Limit: 30, vecLimit: 30, finalLimit: 12, rrfK: 60 },
    fts: { rebuildIntervalMinutes: 60 },
    conversation: { backfillDays: DEFAULT_CONVERSATION_BACKFILL_DAYS },
  },
  analyzers: Object.fromEntries(
    KNOWN_ANALYZER_IDS.map((id) => [id, { enabled: true }]),
  ) as LepAnalyzersConfig,
  sources: {
    github: { enabled: false, tokenEnv: 'GITHUB_TOKEN', maxPrs: 30, since: '' },
    claude: { projectsDir: '' },
    codex: { sessionsDir: '' },
    gitRoots: [],
  },
  logs: { minLevel: 'info' },
};

/** lep.json の version / stage 等の致命的バリデーション違反。起動を中止する。 */
export class LepConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LepConfigError';
  }
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'version',
  'stage',
  'schedule',
  'llm',
  'memory',
  'analyzers',
  'sources',
  'logs',
  '$schema',
]);

const VALID_LOG_LEVELS = new Set<LepLogLevel>(['debug', 'info', 'warn', 'error']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 1 ファイル分の生 JSON を検証し、`PartialLepConfig` に正規化する。
 *
 * - `version` が存在し `LEP_CONFIG_VERSION` 以外 → {@link LepConfigError} (fatal)
 * - `stage` が存在し 6 値以外 → {@link LepConfigError} (fatal)
 * - 未知の top-level キー / 未知 analyzer id → warning (起動継続)
 */
export function validateLepConfigInput(
  raw: unknown,
  sourceLabel: string,
): { value: PartialLepConfig; warnings: string[] } {
  const warnings: string[] = [];
  if (!isPlainObject(raw)) {
    throw new LepConfigError(`${sourceLabel}: ルートは JSON オブジェクトである必要があります`);
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`${sourceLabel}: 未知のキー "${key}" は無視されます`);
    }
  }

  const value: PartialLepConfig = {};

  if (raw['version'] !== undefined) {
    if (raw['version'] !== LEP_CONFIG_VERSION) {
      throw new LepConfigError(
        `${sourceLabel}: version=${String(raw['version'])} は非対応です (期待値 ${LEP_CONFIG_VERSION})`,
      );
    }
    value.version = LEP_CONFIG_VERSION;
  }

  if (raw['stage'] !== undefined) {
    if (!LEP_STAGES.includes(raw['stage'] as LepStage)) {
      throw new LepConfigError(
        `${sourceLabel}: stage="${String(raw['stage'])}" は不正です (許容: ${LEP_STAGES.join(' / ')})`,
      );
    }
    value.stage = raw['stage'] as LepStage;
  }

  if (raw['schedule'] !== undefined) {
    if (!isPlainObject(raw['schedule'])) {
      warnings.push(`${sourceLabel}: schedule はオブジェクトである必要があります (無視)`);
    } else {
      const s = raw['schedule'];
      const schedule: Partial<LepScheduleConfig> = {};
      if (typeof s['intervalSec'] === 'number') schedule.intervalSec = s['intervalSec'];
      if (typeof s['runOnStart'] === 'boolean') schedule.runOnStart = s['runOnStart'];
      if (typeof s['startupDelaySec'] === 'number') schedule.startupDelaySec = s['startupDelaySec'];
      value.schedule = schedule;
    }
  }

  if (raw['llm'] !== undefined) {
    const ollamaRaw = isPlainObject(raw['llm']) && isPlainObject(raw['llm']['providers'])
      ? (raw['llm']['providers'] as Record<string, unknown>)['ollama']
      : undefined;
    if (isPlainObject(ollamaRaw)) {
      const ollama: NonNullable<NonNullable<NonNullable<PartialLepConfig['llm']>['providers']>['ollama']> = {};
      if (typeof ollamaRaw['baseUrl'] === 'string') ollama.baseUrl = ollamaRaw['baseUrl'];
      if (isPlainObject(ollamaRaw['models'])) {
        const m = ollamaRaw['models'];
        const models: Partial<LepOllamaProviderConfig['models']> = {};
        if (typeof m['chat'] === 'string') models.chat = m['chat'];
        if (typeof m['embedding'] === 'string') models.embedding = m['embedding'];
        ollama.models = models;
      }
      value.llm = { providers: { ollama } };
    }
  }

  if (raw['memory'] !== undefined) {
    if (!isPlainObject(raw['memory'])) {
      warnings.push(`${sourceLabel}: memory はオブジェクトである必要があります (無視)`);
    } else {
      const mem = raw['memory'];
      const memory: NonNullable<PartialLepConfig['memory']> = {};
      if (isPlainObject(mem['rag'])) {
        const r = mem['rag'];
        const rag: Partial<LepRagConfig> = {};
        if (typeof r['bm25Limit'] === 'number') rag.bm25Limit = r['bm25Limit'];
        if (typeof r['vecLimit'] === 'number') rag.vecLimit = r['vecLimit'];
        if (typeof r['finalLimit'] === 'number') rag.finalLimit = r['finalLimit'];
        if (typeof r['rrfK'] === 'number') rag.rrfK = r['rrfK'];
        memory.rag = rag;
      }
      if (isPlainObject(mem['fts']) && typeof mem['fts']['rebuildIntervalMinutes'] === 'number') {
        memory.fts = { rebuildIntervalMinutes: mem['fts']['rebuildIntervalMinutes'] };
      }
      if (isPlainObject(mem['conversation']) && typeof mem['conversation']['backfillDays'] === 'number') {
        memory.conversation = { backfillDays: mem['conversation']['backfillDays'] };
      }
      value.memory = memory;
    }
  }

  if (raw['analyzers'] !== undefined) {
    if (!isPlainObject(raw['analyzers'])) {
      warnings.push(`${sourceLabel}: analyzers はオブジェクトである必要があります (無視)`);
    } else {
      const analyzers: LepAnalyzersConfig = {};
      for (const [id, toggle] of Object.entries(raw['analyzers'])) {
        if (!KNOWN_ANALYZER_IDS.includes(id)) {
          warnings.push(`${sourceLabel}: 未知の analyzer "${id}" は無視されます`);
          continue;
        }
        if (isPlainObject(toggle) && typeof toggle['enabled'] === 'boolean') {
          analyzers[id] = { enabled: toggle['enabled'] };
        } else {
          warnings.push(`${sourceLabel}: analyzers.${id} は { "enabled": boolean } 形式である必要があります (無視)`);
        }
      }
      value.analyzers = analyzers;
    }
  }

  if (raw['sources'] !== undefined) {
    if (!isPlainObject(raw['sources'])) {
      warnings.push(`${sourceLabel}: sources はオブジェクトである必要があります (無視)`);
    } else {
      const sourcesRaw = raw['sources'];
      const sources: NonNullable<PartialLepConfig['sources']> = {};

      if (sourcesRaw['github'] !== undefined) {
        if (isPlainObject(sourcesRaw['github'])) {
          const g = sourcesRaw['github'];
          const github: Partial<LepGitHubSourceConfig> = {};
          if (typeof g['enabled'] === 'boolean') github.enabled = g['enabled'];
          if (typeof g['tokenEnv'] === 'string') github.tokenEnv = g['tokenEnv'];
          if (typeof g['maxPrs'] === 'number' && Number.isFinite(g['maxPrs'])) {
            github.maxPrs = g['maxPrs'];
          }
          if (typeof g['since'] === 'string') github.since = g['since'];
          sources.github = github;
        } else {
          warnings.push(`${sourceLabel}: sources.github はオブジェクトである必要があります (無視)`);
        }
      }

      if (sourcesRaw['claude'] !== undefined) {
        if (isPlainObject(sourcesRaw['claude'])) {
          const c = sourcesRaw['claude'];
          const claude: Partial<LepClaudeSourceConfig> = {};
          if (typeof c['projectsDir'] === 'string') claude.projectsDir = c['projectsDir'];
          sources.claude = claude;
        } else {
          warnings.push(`${sourceLabel}: sources.claude はオブジェクトである必要があります (無視)`);
        }
      }

      if (sourcesRaw['codex'] !== undefined) {
        if (isPlainObject(sourcesRaw['codex'])) {
          const cx = sourcesRaw['codex'];
          const codex: Partial<LepCodexSourceConfig> = {};
          if (typeof cx['sessionsDir'] === 'string') codex.sessionsDir = cx['sessionsDir'];
          sources.codex = codex;
        } else {
          warnings.push(`${sourceLabel}: sources.codex はオブジェクトである必要があります (無視)`);
        }
      }

      if (sourcesRaw['gitRoots'] !== undefined) {
        if (
          Array.isArray(sourcesRaw['gitRoots']) &&
          sourcesRaw['gitRoots'].every((r) => typeof r === 'string')
        ) {
          sources.gitRoots = sourcesRaw['gitRoots'] as string[];
        } else {
          warnings.push(`${sourceLabel}: sources.gitRoots は文字列配列である必要があります (無視)`);
        }
      }

      if (Object.keys(sources).length > 0) value.sources = sources;
    }
  }

  if (raw['logs'] !== undefined && isPlainObject(raw['logs'])) {
    const level = raw['logs']['minLevel'];
    if (typeof level === 'string' && VALID_LOG_LEVELS.has(level as LepLogLevel)) {
      value.logs = { minLevel: level as LepLogLevel };
    } else if (level !== undefined) {
      warnings.push(`${sourceLabel}: logs.minLevel="${String(level)}" は不正です (無視)`);
    }
  }

  return { value, warnings };
}

/** `base` に `override` を deep merge した新しい {@link LepConfig} を返す (leaf 値を上書き)。 */
export function mergeLepConfig(base: LepConfig, override: PartialLepConfig): LepConfig {
  return {
    version: override.version ?? base.version,
    stage: override.stage ?? base.stage,
    schedule: {
      intervalSec: override.schedule?.intervalSec ?? base.schedule.intervalSec,
      runOnStart: override.schedule?.runOnStart ?? base.schedule.runOnStart,
      startupDelaySec: override.schedule?.startupDelaySec ?? base.schedule.startupDelaySec,
    },
    llm: {
      providers: {
        ollama: {
          baseUrl: override.llm?.providers?.ollama?.baseUrl ?? base.llm.providers.ollama.baseUrl,
          models: {
            chat: override.llm?.providers?.ollama?.models?.chat ?? base.llm.providers.ollama.models.chat,
            embedding:
              override.llm?.providers?.ollama?.models?.embedding ??
              base.llm.providers.ollama.models.embedding,
          },
        },
      },
    },
    memory: {
      rag: {
        bm25Limit: override.memory?.rag?.bm25Limit ?? base.memory.rag.bm25Limit,
        vecLimit: override.memory?.rag?.vecLimit ?? base.memory.rag.vecLimit,
        finalLimit: override.memory?.rag?.finalLimit ?? base.memory.rag.finalLimit,
        rrfK: override.memory?.rag?.rrfK ?? base.memory.rag.rrfK,
      },
      fts: {
        rebuildIntervalMinutes:
          override.memory?.fts?.rebuildIntervalMinutes ?? base.memory.fts.rebuildIntervalMinutes,
      },
      conversation: {
        backfillDays: override.memory?.conversation?.backfillDays ?? base.memory.conversation.backfillDays,
      },
    },
    // analyzers は id 単位で上書き (未指定 id は base を維持)
    analyzers: { ...base.analyzers, ...(override.analyzers ?? {}) },
    sources: {
      github: {
        enabled: override.sources?.github?.enabled ?? base.sources.github.enabled,
        tokenEnv: override.sources?.github?.tokenEnv ?? base.sources.github.tokenEnv,
        maxPrs: override.sources?.github?.maxPrs ?? base.sources.github.maxPrs,
        since: override.sources?.github?.since ?? base.sources.github.since,
      },
      claude: {
        projectsDir: override.sources?.claude?.projectsDir ?? base.sources.claude.projectsDir,
      },
      codex: {
        sessionsDir: override.sources?.codex?.sessionsDir ?? base.sources.codex.sessionsDir,
      },
      gitRoots: override.sources?.gitRoots ?? base.sources.gitRoots,
    },
    logs: { minLevel: override.logs?.minLevel ?? base.logs.minLevel },
  };
}

/** 旧 VS Code 設定 / config.json (TrailServerConfig) から lep.json への migration 入力。 */
export interface LegacyLepConfigInput {
  /** `anytimeTrail.analyzeAll.enabled` (boolean)。true→primary+memory / false→disabled */
  analyzeAllEnabled?: boolean;
  /** `TrailServerConfig.analyzeAll` (intervalSec / runOnStart / startupDelaySec) */
  analyzeAll?: Partial<LepScheduleConfig>;
  /** `anytimeTrail.memory.ollama.baseUrl` */
  ollamaBaseUrl?: string;
  /** `TrailServerConfig.memory.chat.model` */
  chatModel?: string;
  /** `TrailServerConfig.memory.embedding.model` */
  embeddingModel?: string;
  /** `TrailServerConfig.gitRoots` */
  gitRoots?: string[];
  /** `TrailServerConfig.memory.rag` */
  rag?: Partial<LepRagConfig>;
  /** `TrailServerConfig.memory.fts` */
  fts?: Partial<LepFtsConfig>;
  /** `TrailServerConfig.memory.conversation.backfillDays` */
  backfillDays?: number;
}

/**
 * 旧設定を `PartialLepConfig` にマッピングする (純粋関数)。
 *
 * - `analyzeAllEnabled` true → `stage: "primary+memory"` / false → `stage: "disabled"`
 *   (undefined のときは stage を出力せず default を使う)
 * - `analyzeAll.*` → `schedule.*`
 * - `ollamaBaseUrl` / `chatModel` / `embeddingModel` → `llm.providers.ollama.*`
 */
export function migrateLegacyToLepConfig(legacy: LegacyLepConfigInput): PartialLepConfig {
  const out: PartialLepConfig = {};

  if (legacy.analyzeAllEnabled !== undefined) {
    out.stage = legacy.analyzeAllEnabled ? 'primary+memory' : 'disabled';
  }

  if (legacy.analyzeAll) {
    const schedule: Partial<LepScheduleConfig> = {};
    if (typeof legacy.analyzeAll.intervalSec === 'number') schedule.intervalSec = legacy.analyzeAll.intervalSec;
    if (typeof legacy.analyzeAll.runOnStart === 'boolean') schedule.runOnStart = legacy.analyzeAll.runOnStart;
    if (typeof legacy.analyzeAll.startupDelaySec === 'number') schedule.startupDelaySec = legacy.analyzeAll.startupDelaySec;
    if (Object.keys(schedule).length > 0) out.schedule = schedule;
  }

  const ollama: { baseUrl?: string; models?: Partial<LepOllamaProviderConfig['models']> } = {};
  if (legacy.ollamaBaseUrl) ollama.baseUrl = legacy.ollamaBaseUrl;
  const models: Partial<LepOllamaProviderConfig['models']> = {};
  if (legacy.chatModel) models.chat = legacy.chatModel;
  if (legacy.embeddingModel) models.embedding = legacy.embeddingModel;
  if (Object.keys(models).length > 0) ollama.models = models;
  if (Object.keys(ollama).length > 0) out.llm = { providers: { ollama } };

  if (legacy.gitRoots && legacy.gitRoots.length > 0) out.sources = { gitRoots: legacy.gitRoots };

  const memory: NonNullable<PartialLepConfig['memory']> = {};
  if (legacy.rag && Object.keys(legacy.rag).length > 0) memory.rag = legacy.rag;
  if (legacy.fts && typeof legacy.fts.rebuildIntervalMinutes === 'number') memory.fts = legacy.fts;
  if (typeof legacy.backfillDays === 'number') memory.conversation = { backfillDays: legacy.backfillDays };
  if (Object.keys(memory).length > 0) out.memory = memory;

  return out;
}

/**
 * 旧 `config.json` (TrailServerConfig 形状) の生 JSON を {@link LegacyLepConfigInput} に写像する純粋関数。
 * 型が合わない項目は黙って無視する (移行は best-effort)。`analyzeAllEnabled` は config.json に
 * 存在しないため呼び出し側が補う。
 */
export function legacyFromConfigJson(raw: unknown): LegacyLepConfigInput {
  const out: LegacyLepConfigInput = {};
  if (!isPlainObject(raw)) return out;

  if (isPlainObject(raw['analyzeAll'])) {
    const a = raw['analyzeAll'];
    const schedule: Partial<LepScheduleConfig> = {};
    if (typeof a['intervalSec'] === 'number') schedule.intervalSec = a['intervalSec'];
    if (typeof a['runOnStart'] === 'boolean') schedule.runOnStart = a['runOnStart'];
    if (typeof a['startupDelaySec'] === 'number') schedule.startupDelaySec = a['startupDelaySec'];
    if (Object.keys(schedule).length > 0) out.analyzeAll = schedule;
  }

  if (Array.isArray(raw['gitRoots']) && raw['gitRoots'].every((r) => typeof r === 'string')) {
    out.gitRoots = raw['gitRoots'] as string[];
  }

  const mem = isPlainObject(raw['memory']) ? raw['memory'] : undefined;
  if (mem) {
    if (isPlainObject(mem['ollama']) && typeof mem['ollama']['baseUrl'] === 'string') {
      out.ollamaBaseUrl = mem['ollama']['baseUrl'];
    }
    if (isPlainObject(mem['chat']) && typeof mem['chat']['model'] === 'string') {
      out.chatModel = mem['chat']['model'];
    }
    if (isPlainObject(mem['embedding']) && typeof mem['embedding']['model'] === 'string') {
      out.embeddingModel = mem['embedding']['model'];
    }
    if (isPlainObject(mem['rag'])) {
      const r = mem['rag'];
      const rag: Partial<LepRagConfig> = {};
      if (typeof r['bm25Limit'] === 'number') rag.bm25Limit = r['bm25Limit'];
      if (typeof r['vecLimit'] === 'number') rag.vecLimit = r['vecLimit'];
      if (typeof r['finalLimit'] === 'number') rag.finalLimit = r['finalLimit'];
      if (typeof r['rrfK'] === 'number') rag.rrfK = r['rrfK'];
      if (Object.keys(rag).length > 0) out.rag = rag;
    }
    if (isPlainObject(mem['fts']) && typeof mem['fts']['rebuildIntervalMinutes'] === 'number') {
      out.fts = { rebuildIntervalMinutes: mem['fts']['rebuildIntervalMinutes'] };
    }
    if (isPlainObject(mem['conversation']) && typeof mem['conversation']['backfillDays'] === 'number') {
      out.backfillDays = mem['conversation']['backfillDays'];
    }
  }

  return out;
}

export interface LoadLepConfigOptions {
  /** workspace ルート (tier 1/2 の lep.json / lep.local.json 探索に使用) */
  workspaceRoot?: string;
  /** home ディレクトリ (tier 3 の ~/.anytime/trail/lep.json 探索に使用)。テストで注入可能 */
  homeDir?: string;
  /** lep.json の代替パス (`anytimeTrail.lep.configPath`)。指定時はこのファイルのみを最上位で読む */
  configPathOverride?: string;
  logger?: Pick<Logger, 'warn' | 'info'>;
}

export interface LepConfigLoadResult {
  config: LepConfig;
  /** 実際に読み込まれたファイルパス (precedence 低→高) */
  loadedPaths: string[];
  warnings: string[];
}

/** lep.json の標準探索パス (precedence 低→高)。`<workspace>/.anytime/trail` が tier 1/2。 */
export function lepConfigSearchPaths(workspaceRoot: string | undefined, home: string): string[] {
  const paths: string[] = [join(home, '.anytime', 'trail', 'lep.json')];
  if (workspaceRoot) {
    paths.push(join(workspaceRoot, '.anytime', 'trail', 'lep.json'));
    paths.push(join(workspaceRoot, '.anytime', 'trail', 'lep.local.json'));
  }
  return paths;
}

/** workspace の主 lep.json パス (migration 生成先)。 */
export function workspaceLepConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.anytime', 'trail', 'lep.json');
}

/**
 * lep.json を 4 階層 (内蔵 default + 最大 3 ファイル) から探索し deep merge して返す。
 *
 * precedence (低→高): 内蔵 default < `~/.anytime/trail/lep.json`
 *   < `<workspace>/.anytime/trail/lep.json` < `<workspace>/.anytime/trail/lep.local.json`。
 * `configPathOverride` 指定時は default + そのファイルのみ。
 *
 * version / stage の不正は {@link LepConfigError} を throw する (起動中止)。
 * 未知キー等は warning として収集し logger に出力する。
 */
export function loadLepConfig(opts: LoadLepConfigOptions = {}): LepConfigLoadResult {
  const home = opts.homeDir ?? homedir();
  const candidates = opts.configPathOverride
    ? [opts.configPathOverride]
    : lepConfigSearchPaths(opts.workspaceRoot, home);

  let config = DEFAULT_LEP_CONFIG;
  const loadedPaths: string[] = [];
  const warnings: string[] = [];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // パース不能は fatal にしない (default / 他 tier にフォールバック) が warn する
      const w = `[LepConfig] ${path} のパースに失敗: ${msg} (無視)`;
      warnings.push(w);
      opts.logger?.warn(w);
      continue;
    }
    const { value, warnings: fileWarnings } = validateLepConfigInput(raw, path);
    config = mergeLepConfig(config, value);
    loadedPaths.push(path);
    for (const w of fileWarnings) {
      warnings.push(w);
      opts.logger?.warn(`[LepConfig] ${w}`);
    }
  }

  return { config, loadedPaths, warnings };
}

export interface EnsureLepConfigOptions {
  workspaceRoot: string;
  legacy: LegacyLepConfigInput;
  logger?: Pick<Logger, 'warn' | 'info'>;
}

export interface EnsureLepConfigResult {
  /** 新規生成したか (既存ファイルがあれば false) */
  created: boolean;
  /** 生成 / 既存の lep.json パス */
  path: string;
}

/**
 * `<workspace>/.anytime/trail/lep.json` が不在のとき、旧設定から migration して生成する。
 *
 * 設計書 13.5 に従い**ファイル不在時のみ**生成する (既存ファイルは上書きしない)。
 * TOCTOU (`js/file-system-race`) は `flag: 'wx'` (排他作成) で回避する。
 */
export function ensureLepConfigFile(opts: EnsureLepConfigOptions): EnsureLepConfigResult {
  const path = workspaceLepConfigPath(opts.workspaceRoot);
  const migrated = mergeLepConfig(DEFAULT_LEP_CONFIG, migrateLegacyToLepConfig(opts.legacy));

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(migrated, null, 2) + '\n', {
      encoding: 'utf-8',
      flag: 'wx',
    });
    opts.logger?.info(
      `[LepConfig] lep.json を生成しました: ${path} (stage=${migrated.stage})。リポジトリへの commit を推奨します`,
    );
    return { created: true, path };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      opts.logger?.warn(
        `[LepConfig] lep.json の生成に失敗: ${path}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { created: false, path };
  }
}

/** workspace の旧 config.json パス。 */
export function workspaceConfigJsonPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.anytime', 'trail', 'config.json');
}

export interface MigrateConfigJsonOptions {
  workspaceRoot: string;
  /** lep.json 不在時に stage を決める (config.json には存在しないため呼び出し側が補う)。 */
  analyzeAllEnabled?: boolean;
  logger?: Pick<Logger, 'warn' | 'info'>;
}

export interface MigrateConfigJsonResult {
  /** 実際に移行 (config.json → lep.json 反映 + rename) を行ったか。 */
  migrated: boolean;
  lepPath: string;
  /** rename 後の config.json パス (移行した場合のみ)。 */
  configRenamedTo?: string;
}

/**
 * 旧 `config.json` を `lep.json` へ**一度きり**移行する (ハード切替)。
 *
 * - config.json 不在 → no-op (`migrated:false`)。
 * - lep.json 不在 → config.json + `analyzeAllEnabled` から生成。
 * - lep.json 既存 → **欠落 top-level セクションのみ** config.json 由来値で gap-fill
 *   (既存の明示値は維持)。
 * - 完了後 config.json を `config.json.migrated-YYYYMMDD` に rename して保全 (削除しない)。
 *   rename 済みなら次回以降は config.json 不在となり冪等。
 *
 * lep.json のパース失敗時は rename せず warn に留め、ユーザーが修正できるようにする。
 */
export function migrateConfigJsonIntoLepJson(opts: MigrateConfigJsonOptions): MigrateConfigJsonResult {
  const lepPath = workspaceLepConfigPath(opts.workspaceRoot);
  const configPath = workspaceConfigJsonPath(opts.workspaceRoot);

  if (!existsSync(configPath)) return { migrated: false, lepPath };

  let configRaw: unknown;
  try {
    configRaw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    opts.logger?.warn(
      `[LepConfig] config.json のパースに失敗したため移行をスキップ: ${configPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { migrated: false, lepPath };
  }

  const legacy: LegacyLepConfigInput = { ...legacyFromConfigJson(configRaw) };
  if (opts.analyzeAllEnabled !== undefined) legacy.analyzeAllEnabled = opts.analyzeAllEnabled;
  const migrated = migrateLegacyToLepConfig(legacy);

  // existsSync(lepPath) → write/read の check-then-use は js/file-system-race (TOCTOU) を
  // 生むため、readFileSync を直接試行し ENOENT を「不在」とみなす (チェックと読みを 1 操作に統合)。
  let lepContent: string | null = null;
  try {
    lepContent = readFileSync(lepPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      opts.logger?.warn(
        `[LepConfig] 既存 lep.json の読み取りに失敗したため config.json を残します: ${lepPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { migrated: false, lepPath };
    }
    // ENOENT → lep.json は不在。生成パスへ進む。
  }

  if (lepContent === null) {
    const full = mergeLepConfig(DEFAULT_LEP_CONFIG, migrated);
    mkdirSync(dirname(lepPath), { recursive: true });
    writeFileSync(lepPath, JSON.stringify(full, null, 2) + '\n', { encoding: 'utf-8' });
  } else {
    let lepRaw: unknown;
    try {
      lepRaw = JSON.parse(lepContent);
    } catch (err) {
      opts.logger?.warn(
        `[LepConfig] 既存 lep.json のパースに失敗したため config.json を残します: ${lepPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { migrated: false, lepPath };
    }
    if (!isPlainObject(lepRaw)) {
      opts.logger?.warn(`[LepConfig] 既存 lep.json がオブジェクトでないため config.json を残します: ${lepPath}`);
      return { migrated: false, lepPath };
    }
    // 欠落 top-level セクションのみ移行値を注入する (既存の明示値は触らない)。
    const lepObj = lepRaw as Record<string, unknown>;
    const migratedRecord = migrated as unknown as Record<string, unknown>;
    let injected = false;
    for (const key of ['stage', 'sources', 'schedule', 'llm', 'memory'] as const) {
      if (!(key in lepObj) && migratedRecord[key] !== undefined) {
        lepObj[key] = migratedRecord[key];
        injected = true;
      }
    }
    if (injected) {
      writeFileSync(lepPath, JSON.stringify(lepObj, null, 2) + '\n', { encoding: 'utf-8' });
    }
  }

  // config.json を保全リネーム (削除しない)。
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  let renamedTo = `${configPath}.migrated-${stamp}`;
  if (existsSync(renamedTo)) renamedTo = `${configPath}.migrated-${stamp}-${Date.now()}`;
  try {
    renameSync(configPath, renamedTo);
  } catch (err) {
    opts.logger?.warn(
      `[LepConfig] config.json の rename に失敗 (移行値は lep.json に反映済み): ${configPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { migrated: true, lepPath };
  }

  opts.logger?.info(
    `[LepConfig] config.json を lep.json へ移行しました。config.json は ${renamedTo} に退避しました`,
  );
  return { migrated: true, lepPath, configRenamedTo: renamedTo };
}
