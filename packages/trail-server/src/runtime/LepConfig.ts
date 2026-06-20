import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

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

/**
 * lep.json `analyzers` で toggle 可能な Layer 2 (primary) analyzer の ID。
 *
 * 核となる SessionImporter / CommitResolver / CostRebuilder / CountsRebuilder /
 * PersistAnalyzer / CodeGraphBuilder は依存の基盤のため toggle 対象外 (常時実行)。
 * ここに挙げた analyzer は `enabled:false` で個別に取込・解析を抑止できる
 * (例: ReleaseResolver を無効化すると git tag→releases と release codegraph が止まる)。
 */
export const PRIMARY_TOGGLEABLE_ANALYZER_IDS = [
  'ReleaseResolver',
  'CoverageImporter',
  'BehaviorAnalyzer',
  'CommitFilesBackfiller',
  'SubagentTypeBackfiller',
  'MessageCommitMatcher',
] as const;

export type PrimaryToggleableAnalyzerId = (typeof PRIMARY_TOGGLEABLE_ANALYZER_IDS)[number];

/**
 * lep.json `analyzers` で toggle 可能な全 analyzer ID。
 *
 * 並びは実行 (Wave) 順に揃える: Layer 2 primary → Layer 3 memory → Layer 4 derived。
 * DEFAULT_LEP_CONFIG.analyzers / 生成テンプレの出力順がこの順になる (toggle 機能には無影響)。
 */
export const KNOWN_ANALYZER_IDS: readonly string[] = [
  ...PRIMARY_TOGGLEABLE_ANALYZER_IDS,
  ...MEMORY_ANALYZER_IDS,
  ...AGGREGATOR_ANALYZER_IDS,
];

export type LepLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LepScheduleConfig {
  intervalSec: number;
  runOnStart: boolean;
  startupDelaySec: number;
}

/**
 * Ollama 熱負荷スロットリング (劣化 CPU の延命策)。embeddings レイテンシの代理信号で
 * COOLING を判定し、背景パイプラインの per-request 待機 + スケジューラ gate で熱を逃がす。
 * 既定 off。詳細: plan/20260524-ollama-thermal-throttle-design.ja.md。
 */
export interface LepThrottleConfig {
  enabled: boolean;
  slowdownFactor: number;
  cooldownSec: number;
  maxContinuousMin: number;
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

/**
 * ドキュメント検索（doc-core）の取込元。`root` はドキュメントリポジトリのルート
 * （例 `/Shared/anytime-markdown-docs`）。空文字は doc-core ingest を無効化（既定オフ）。
 */
export interface LepDocsSourceConfig {
  root: string;
}

export interface LepSourcesConfig {
  github: LepGitHubSourceConfig;
  claude: LepClaudeSourceConfig;
  codex: LepCodexSourceConfig;
  docs: LepDocsSourceConfig;
  /**
   * 解析対象 git リポジトリのルート群 (拡張・daemon 共通の監視対象)。
   * daemon は CLI 引数 → home-tier lep.json の順で bootstrap する (workspace lep.json は
   * gitRoots 解決後でないと読めないため非参照)。
   * 拡張は本 gitRoots に加えて anytimeTrail.workspace.path を監視対象へ追加する。
   */
  gitRoots: string[];
}

/**
 * trail.db の保存先 (旧 VS Code 設定 `anytimeTrail.database.storagePath` の移行先)。
 * 絶対パスまたは workspace ルートからの相対パス。既定 `.anytime/trail/db`。
 */
export interface LepDatabaseConfig {
  storagePath: string;
}

/**
 * ワークスペース関連パス。`docsPath` は C4 ドキュメントリンク用ドキュメントディレクトリ
 * (旧 VS Code 設定 `anytimeTrail.workspace.docsPath` の移行先)。空文字 = 未設定。
 *
 * `excludeRoot` は code graph / C4 解析の除外パターン (`.anytime/trail/analyze-exclude`) を
 * 読むディレクトリ。絶対パス、または workspace ルートからの相対パス。空文字 = 未指定
 * (解析対象リポ自身の `.anytime/trail/analyze-exclude` にフォールバック)。
 * 外部リポ (gitRoots) をどのフォルダから解析しても単一の analyze-exclude を適用したい
 * 場合に、中央ディレクトリ (例: 主リポジトリのルート) を指定する。
 */
/**
 * `<workspaceRoot>/.anytime/` 配下の設定ファイルパス。空文字 = 既定
 * (`.anytime/<file>` を workspace ルートから解決)。絶対パスまたは workspace 相対で上書き可。
 * daemon は workspace ルートを確実には知らない (fork 時 cwd 未指定) ため、extension が
 * {@link resolveWorkspaceConfigPath} で絶対化して daemon へ渡す。これにより categories /
 * metrics の読み取りが gitRoot 非依存になる。
 */
export interface LepWorkspaceConfigPaths {
  commitCategories: string;
  toolCategories: string;
  skillCategories: string;
  metricsThresholds: string;
}

export interface LepWorkspaceConfig {
  docsPath: string;
  excludeRoot: string;
  configPaths: LepWorkspaceConfigPaths;
}

export interface LepConfig {
  version: number;
  stage: LepStage;
  schedule: LepScheduleConfig;
  llm: LepLlmConfig;
  memory: LepMemoryConfig;
  analyzers: LepAnalyzersConfig;
  sources: LepSourcesConfig;
  database: LepDatabaseConfig;
  workspace: LepWorkspaceConfig;
  throttle: LepThrottleConfig;
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
 * code graph / C4 解析の除外ルート (`workspace.excludeRoot`) を解決する。
 *
 * - 空文字 / 空白のみ → `undefined`（呼び出し側で解析対象リポ自身にフォールバックさせる）
 * - 絶対パス → そのまま返す
 * - 相対パス → `workspaceRoot` 起点で絶対化（`workspaceRoot` 未指定なら相対のまま返す）
 *
 * 返り値はそのまま `loadAnalyzeExclude(excludeRoot)` / `runAnalyzeCurrentCodePipeline` /
 * `CodeGraphService` の `excludeRoot` に渡せる。
 */
export function resolveExcludeRoot(
  config: LepConfig,
  workspaceRoot: string | undefined,
): string | undefined {
  const raw = config.workspace.excludeRoot.trim();
  if (raw === '') return undefined;
  if (isAbsolute(raw)) return raw;
  return workspaceRoot ? join(workspaceRoot, raw) : raw;
}

/** {@link LepWorkspaceConfigPaths} の各キーの既定 (workspace 相対)。空文字時に使う。 */
const WORKSPACE_CONFIG_PATH_DEFAULTS: Record<keyof LepWorkspaceConfigPaths, string> = {
  commitCategories: join('.anytime', 'commit-categories.json'),
  toolCategories: join('.anytime', 'tool-categories.json'),
  skillCategories: join('.anytime', 'skill-categories.json'),
  metricsThresholds: join('.anytime', 'metrics-thresholds.yaml'),
};

/** {@link LepWorkspaceConfigPaths} の全キー。validate / merge の単一の真実源。 */
const WORKSPACE_CONFIG_PATH_KEYS = Object.keys(
  WORKSPACE_CONFIG_PATH_DEFAULTS,
) as (keyof LepWorkspaceConfigPaths)[];

/** override を base に上書きマージする (キー追加時もここだけで完結)。 */
function mergeWorkspaceConfigPaths(
  base: LepWorkspaceConfigPaths,
  override?: Partial<LepWorkspaceConfigPaths>,
): LepWorkspaceConfigPaths {
  const result = { ...base };
  for (const key of WORKSPACE_CONFIG_PATH_KEYS) {
    result[key] = override?.[key] ?? base[key];
  }
  return result;
}

/**
 * `workspace.configPaths.<key>` を絶対パスへ解決する。
 *
 * - 空文字 → 既定 (`.anytime/<file>`) を workspace 相対として解決
 * - 絶対パス → そのまま
 * - 相対パス → `workspaceRoot` 起点で絶対化（`workspaceRoot` 未指定なら `undefined`）
 *
 * 返り値はそのまま `load*FromFile(path)` / `MetricsThresholdsLoader.fromFile(path)` に渡せる。
 */
export function resolveWorkspaceConfigPath(
  config: LepConfig,
  key: keyof LepWorkspaceConfigPaths,
  workspaceRoot: string | undefined,
): string | undefined {
  const raw = config.workspace.configPaths[key].trim();
  const rel = raw === '' ? WORKSPACE_CONFIG_PATH_DEFAULTS[key] : raw;
  if (isAbsolute(rel)) return rel;
  return workspaceRoot ? join(workspaceRoot, rel) : undefined;
}

/**
 * `lep.json` の `analyzers.<id>.enabled === false` な analyzer id 一覧を返す
 * (primary / memory / aggregator を区別せず全 disabled id)。AnalyzeAllRunner の
 * `disabledPrimaryAnalyzers` / `disabledMemoryAnalyzers` / `disabledAggregators` の
 * いずれにもそのまま渡してよい (各 layer で自分の id のみ照合される)。
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
    docs?: Partial<LepDocsSourceConfig>;
    gitRoots?: string[];
  };
  database?: Partial<LepDatabaseConfig>;
  workspace?: {
    docsPath?: string;
    excludeRoot?: string;
    configPaths?: Partial<LepWorkspaceConfigPaths>;
  };
  throttle?: Partial<LepThrottleConfig>;
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
    docs: { root: '' },
    gitRoots: [],
  },
  database: { storagePath: '.anytime/trail/db' },
  workspace: {
    docsPath: '',
    excludeRoot: '',
    configPaths: {
      commitCategories: '',
      toolCategories: '',
      skillCategories: '',
      metricsThresholds: '',
    },
  },
  throttle: { enabled: false, slowdownFactor: 1.5, cooldownSec: 30, maxContinuousMin: 15 },
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
  'database',
  'workspace',
  'throttle',
  'logs',
  '$schema',
]);

const VALID_LOG_LEVELS = new Set<LepLogLevel>(['debug', 'info', 'warn', 'error']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateLlmSection(
  raw: unknown,
): NonNullable<PartialLepConfig['llm']> | undefined {
  const ollamaRaw = isPlainObject(raw) && isPlainObject(raw['providers'])
    ? raw['providers']['ollama']
    : undefined;
  if (!isPlainObject(ollamaRaw)) return undefined;
  const ollama: NonNullable<NonNullable<NonNullable<PartialLepConfig['llm']>['providers']>['ollama']> = {};
  if (typeof ollamaRaw['baseUrl'] === 'string') ollama.baseUrl = ollamaRaw['baseUrl'];
  if (isPlainObject(ollamaRaw['models'])) {
    const m = ollamaRaw['models'];
    const models: Partial<LepOllamaProviderConfig['models']> = {};
    if (typeof m['chat'] === 'string') models.chat = m['chat'];
    if (typeof m['embedding'] === 'string') models.embedding = m['embedding'];
    ollama.models = models;
  }
  return { providers: { ollama } };
}

function validateMemorySection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): NonNullable<PartialLepConfig['memory']> | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    warnings.push(`${sourceLabel}: memory はオブジェクトである必要があります (無視)`);
    return undefined;
  }
  const memory: NonNullable<PartialLepConfig['memory']> = {};
  if (isPlainObject(raw['rag'])) {
    const r = raw['rag'];
    const rag: Partial<LepRagConfig> = {};
    if (typeof r['bm25Limit'] === 'number') rag.bm25Limit = r['bm25Limit'];
    if (typeof r['vecLimit'] === 'number') rag.vecLimit = r['vecLimit'];
    if (typeof r['finalLimit'] === 'number') rag.finalLimit = r['finalLimit'];
    if (typeof r['rrfK'] === 'number') rag.rrfK = r['rrfK'];
    memory.rag = rag;
  }
  if (isPlainObject(raw['fts']) && typeof raw['fts']['rebuildIntervalMinutes'] === 'number') {
    memory.fts = { rebuildIntervalMinutes: raw['fts']['rebuildIntervalMinutes'] };
  }
  if (isPlainObject(raw['conversation']) && typeof raw['conversation']['backfillDays'] === 'number') {
    memory.conversation = { backfillDays: raw['conversation']['backfillDays'] };
  }
  return memory;
}

function validateAnalyzersSection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): LepAnalyzersConfig | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    warnings.push(`${sourceLabel}: analyzers はオブジェクトである必要があります (無視)`);
    return undefined;
  }
  const analyzers: LepAnalyzersConfig = {};
  for (const [id, toggle] of Object.entries(raw)) {
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
  return analyzers;
}

function validateSourcesSection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): NonNullable<PartialLepConfig['sources']> | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    warnings.push(`${sourceLabel}: sources はオブジェクトである必要があります (無視)`);
    return undefined;
  }
  const sources: NonNullable<PartialLepConfig['sources']> = {};

  if (raw['github'] !== undefined) {
    if (isPlainObject(raw['github'])) {
      const g = raw['github'];
      const github: Partial<LepGitHubSourceConfig> = {};
      if (typeof g['enabled'] === 'boolean') github.enabled = g['enabled'];
      if (typeof g['tokenEnv'] === 'string') github.tokenEnv = g['tokenEnv'];
      if (typeof g['maxPrs'] === 'number' && Number.isFinite(g['maxPrs'])) github.maxPrs = g['maxPrs'];
      if (typeof g['since'] === 'string') github.since = g['since'];
      sources.github = github;
    } else {
      warnings.push(`${sourceLabel}: sources.github はオブジェクトである必要があります (無視)`);
    }
  }

  if (raw['claude'] !== undefined) {
    if (isPlainObject(raw['claude'])) {
      const c = raw['claude'];
      const claude: Partial<LepClaudeSourceConfig> = {};
      if (typeof c['projectsDir'] === 'string') claude.projectsDir = c['projectsDir'];
      sources.claude = claude;
    } else {
      warnings.push(`${sourceLabel}: sources.claude はオブジェクトである必要があります (無視)`);
    }
  }

  if (raw['codex'] !== undefined) {
    if (isPlainObject(raw['codex'])) {
      const cx = raw['codex'];
      const codex: Partial<LepCodexSourceConfig> = {};
      if (typeof cx['sessionsDir'] === 'string') codex.sessionsDir = cx['sessionsDir'];
      sources.codex = codex;
    } else {
      warnings.push(`${sourceLabel}: sources.codex はオブジェクトである必要があります (無視)`);
    }
  }

  if (raw['docs'] !== undefined) {
    if (isPlainObject(raw['docs'])) {
      const dc = raw['docs'];
      const docs: Partial<LepDocsSourceConfig> = {};
      if (typeof dc['root'] === 'string') docs.root = dc['root'];
      sources.docs = docs;
    } else {
      warnings.push(`${sourceLabel}: sources.docs はオブジェクトである必要があります (無視)`);
    }
  }

  if (raw['gitRoots'] !== undefined) {
    if (Array.isArray(raw['gitRoots']) && raw['gitRoots'].every((r) => typeof r === 'string')) {
      sources.gitRoots = raw['gitRoots'] as string[];
    } else {
      warnings.push(`${sourceLabel}: sources.gitRoots は文字列配列である必要があります (無視)`);
    }
  }

  return Object.keys(sources).length > 0 ? sources : undefined;
}

function validateScheduleSection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): Partial<LepScheduleConfig> | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    warnings.push(`${sourceLabel}: schedule はオブジェクトである必要があります (無視)`);
    return undefined;
  }
  const schedule: Partial<LepScheduleConfig> = {};
  if (typeof raw['intervalSec'] === 'number') schedule.intervalSec = raw['intervalSec'];
  if (typeof raw['runOnStart'] === 'boolean') schedule.runOnStart = raw['runOnStart'];
  if (typeof raw['startupDelaySec'] === 'number') schedule.startupDelaySec = raw['startupDelaySec'];
  return schedule;
}

function validateThrottleSection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): Partial<LepThrottleConfig> | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    warnings.push(`${sourceLabel}: throttle はオブジェクトである必要があります (無視)`);
    return undefined;
  }
  const throttle: Partial<LepThrottleConfig> = {};
  if (typeof raw['enabled'] === 'boolean') throttle.enabled = raw['enabled'];
  if (typeof raw['slowdownFactor'] === 'number') throttle.slowdownFactor = raw['slowdownFactor'];
  if (typeof raw['cooldownSec'] === 'number') throttle.cooldownSec = raw['cooldownSec'];
  if (typeof raw['maxContinuousMin'] === 'number') throttle.maxContinuousMin = raw['maxContinuousMin'];
  return throttle;
}

function validateDatabaseSection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): Partial<LepDatabaseConfig> | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    warnings.push(`${sourceLabel}: database はオブジェクトである必要があります (無視)`);
    return undefined;
  }
  const database: Partial<LepDatabaseConfig> = {};
  if (typeof raw['storagePath'] === 'string') database.storagePath = raw['storagePath'];
  return database;
}

function validateWorkspaceSection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): PartialLepConfig['workspace'] | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    warnings.push(`${sourceLabel}: workspace はオブジェクトである必要があります (無視)`);
    return undefined;
  }
  const workspace: PartialLepConfig['workspace'] = {};
  if (typeof raw['docsPath'] === 'string') workspace.docsPath = raw['docsPath'];
  if (typeof raw['excludeRoot'] === 'string') workspace.excludeRoot = raw['excludeRoot'];
  const rawPaths = raw['configPaths'];
  if (isPlainObject(rawPaths)) {
    const configPaths: Partial<LepWorkspaceConfigPaths> = {};
    for (const key of WORKSPACE_CONFIG_PATH_KEYS) {
      if (typeof rawPaths[key] === 'string') configPaths[key] = rawPaths[key] as string;
    }
    workspace.configPaths = configPaths;
  }
  return workspace;
}

function validateLogsSection(
  raw: unknown,
  sourceLabel: string,
  warnings: string[],
): NonNullable<PartialLepConfig['logs']> | undefined {
  if (raw === undefined || !isPlainObject(raw)) return undefined;
  const level = raw['minLevel'];
  if (typeof level === 'string' && VALID_LOG_LEVELS.has(level as LepLogLevel)) {
    return { minLevel: level as LepLogLevel };
  }
  if (level !== undefined) {
    warnings.push(`${sourceLabel}: logs.minLevel="${String(level)}" は不正です (無視)`);
  }
  return undefined;
}

/** Validates top-level keys and returns any unknown-key warnings. */
function collectUnknownKeyWarnings(raw: Record<string, unknown>, sourceLabel: string): string[] {
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`${sourceLabel}: 未知のキー "${key}" は無視されます`);
    }
  }
  return warnings;
}

/** Validates and extracts version + stage fields, throws LepConfigError on violations. */
function validateVersionAndStage(
  raw: Record<string, unknown>,
  sourceLabel: string,
): Pick<PartialLepConfig, 'version' | 'stage'> {
  const result: Pick<PartialLepConfig, 'version' | 'stage'> = {};
  if (raw['version'] !== undefined) {
    if (raw['version'] !== LEP_CONFIG_VERSION) {
      throw new LepConfigError(
        `${sourceLabel}: version=${String(raw['version'])} は非対応です (期待値 ${LEP_CONFIG_VERSION})`,
      );
    }
    result.version = LEP_CONFIG_VERSION;
  }
  if (raw['stage'] !== undefined) {
    if (!LEP_STAGES.includes(raw['stage'] as LepStage)) {
      throw new LepConfigError(
        `${sourceLabel}: stage="${String(raw['stage'])}" は不正です (許容: ${LEP_STAGES.join(' / ')})`,
      );
    }
    result.stage = raw['stage'] as LepStage;
  }
  return result;
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
  if (!isPlainObject(raw)) {
    throw new LepConfigError(`${sourceLabel}: ルートは JSON オブジェクトである必要があります`);
  }

  const warnings = collectUnknownKeyWarnings(raw, sourceLabel);
  const value: PartialLepConfig = { ...validateVersionAndStage(raw, sourceLabel) };

  const scheduleResult = validateScheduleSection(raw['schedule'], sourceLabel, warnings);
  if (scheduleResult !== undefined) value.schedule = scheduleResult;

  const throttleResult = validateThrottleSection(raw['throttle'], sourceLabel, warnings);
  if (throttleResult !== undefined) value.throttle = throttleResult;

  const llmResult = validateLlmSection(raw['llm']);
  if (llmResult !== undefined) value.llm = llmResult;

  const memResult = validateMemorySection(raw['memory'], sourceLabel, warnings);
  if (memResult !== undefined) value.memory = memResult;

  const analyzersResult = validateAnalyzersSection(raw['analyzers'], sourceLabel, warnings);
  if (analyzersResult !== undefined) value.analyzers = analyzersResult;

  const sourcesResult = validateSourcesSection(raw['sources'], sourceLabel, warnings);
  if (sourcesResult !== undefined) value.sources = sourcesResult;

  const databaseResult = validateDatabaseSection(raw['database'], sourceLabel, warnings);
  if (databaseResult !== undefined) value.database = databaseResult;

  const workspaceResult = validateWorkspaceSection(raw['workspace'], sourceLabel, warnings);
  if (workspaceResult !== undefined) value.workspace = workspaceResult;

  const logsResult = validateLogsSection(raw['logs'], sourceLabel, warnings);
  if (logsResult !== undefined) value.logs = logsResult;

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
    analyzers: override.analyzers ? { ...base.analyzers, ...override.analyzers } : { ...base.analyzers },
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
      docs: {
        root: override.sources?.docs?.root ?? base.sources.docs.root,
      },
      gitRoots: override.sources?.gitRoots ?? base.sources.gitRoots,
    },
    database: {
      storagePath: override.database?.storagePath ?? base.database.storagePath,
    },
    workspace: {
      docsPath: override.workspace?.docsPath ?? base.workspace.docsPath,
      excludeRoot: override.workspace?.excludeRoot ?? base.workspace.excludeRoot,
      configPaths: mergeWorkspaceConfigPaths(base.workspace.configPaths, override.workspace?.configPaths),
    },
    throttle: {
      enabled: override.throttle?.enabled ?? base.throttle.enabled,
      slowdownFactor: override.throttle?.slowdownFactor ?? base.throttle.slowdownFactor,
      cooldownSec: override.throttle?.cooldownSec ?? base.throttle.cooldownSec,
      maxContinuousMin: override.throttle?.maxContinuousMin ?? base.throttle.maxContinuousMin,
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

  const schedule = migrateLegacySchedule(legacy.analyzeAll);
  if (schedule) out.schedule = schedule;

  const llm = migrateLegacyLlm(legacy);
  if (llm) out.llm = llm;

  if (legacy.gitRoots && legacy.gitRoots.length > 0) out.sources = { gitRoots: legacy.gitRoots };

  const memory = migrateLegacyMemory(legacy);
  if (memory) out.memory = memory;

  return out;
}

function migrateLegacySchedule(
  analyzeAll: LegacyLepConfigInput['analyzeAll'],
): Partial<LepScheduleConfig> | null {
  if (!analyzeAll) return null;
  const schedule: Partial<LepScheduleConfig> = {};
  if (typeof analyzeAll.intervalSec === 'number') schedule.intervalSec = analyzeAll.intervalSec;
  if (typeof analyzeAll.runOnStart === 'boolean') schedule.runOnStart = analyzeAll.runOnStart;
  if (typeof analyzeAll.startupDelaySec === 'number') schedule.startupDelaySec = analyzeAll.startupDelaySec;
  return Object.keys(schedule).length > 0 ? schedule : null;
}

function migrateLegacyLlm(
  legacy: LegacyLepConfigInput,
): NonNullable<PartialLepConfig['llm']> | null {
  const ollama: { baseUrl?: string; models?: Partial<LepOllamaProviderConfig['models']> } = {};
  if (legacy.ollamaBaseUrl) ollama.baseUrl = legacy.ollamaBaseUrl;
  const models: Partial<LepOllamaProviderConfig['models']> = {};
  if (legacy.chatModel) models.chat = legacy.chatModel;
  if (legacy.embeddingModel) models.embedding = legacy.embeddingModel;
  if (Object.keys(models).length > 0) ollama.models = models;
  return Object.keys(ollama).length > 0 ? { providers: { ollama } } : null;
}

function migrateLegacyMemory(
  legacy: LegacyLepConfigInput,
): NonNullable<PartialLepConfig['memory']> | null {
  const memory: NonNullable<PartialLepConfig['memory']> = {};
  if (legacy.rag && Object.keys(legacy.rag).length > 0) memory.rag = legacy.rag;
  if (legacy.fts && typeof legacy.fts.rebuildIntervalMinutes === 'number') memory.fts = legacy.fts;
  if (typeof legacy.backfillDays === 'number') memory.conversation = { backfillDays: legacy.backfillDays };
  return Object.keys(memory).length > 0 ? memory : null;
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
    paths.push(join(workspaceRoot, '.anytime', 'trail', 'lep.json'), join(workspaceRoot, '.anytime', 'trail', 'lep.local.json'));
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
/**
 * lep.json 生成時に各セクションへ付与する注釈 (_comment)。
 *
 * JSON にコメント構文がないため `_comment` キーで代用する。loader は未知キーを無視するため
 * 動作には影響しない (top-level `_comment` のみ起動時に info 警告を 1 行出す)。
 */
const LEP_TOP_COMMENT = {
  _note:
    '// や /* */ コメントは JSON.parse(LepConfig.ts) が壊れるため使用不可。注釈は _comment キーで代用する。この top-level _comment は起動時に \'lep.json: 未知のキー "_comment" は無視されます\' という info 警告を1行出すが動作には影響しない。各セクション内のネスト _comment は警告なし。',
  version: 'lep.json スキーマ版数。現行は 1 固定 (不一致は起動中止)。',
  stage:
    '実行する Wave (Layer) 範囲。disabled=何もしない / sources=Wave1のみ / primary=Wave1+2 / memory=Wave3のみ / primary+memory=Wave1+2+3 / all=Wave1+2+3+4(全実行)。Wave1=sources取込, Wave2=primary解析, Wave3=memory(記憶/RAG, ollama必須), Wave4=derived(横断集計)。',
  schedule: 'パイプラインの定期実行設定。',
  llm:
    'memory analyzer が使う LLM/embedding プロバイダ。Dev Container からホストの ollama に到達するため host.docker.internal を使用。',
  analyzers:
    '各 analyzer の有効/無効。Layer2(primary)=Release/Coverage/Behavior/CommitFiles/SubagentType/MessageCommit(取込・解析を個別抑止可), Layer3(memory)=7個, Layer4(derived)=Dora/CrossSource(stage=all時のみ実行)。SessionImporter 等の核 analyzer は toggle 不可。enabled以外のキーは無視される。',
  sources:
    '外部ソース取込設定 (Layer1)。gitRoots=解析対象 git リポジトリのルート群(拡張・daemon 共通。拡張は anytimeTrail.workspace.path も追加) / github=PR取込 / claude=セッションログ探索元 / codex=Codexセッション探索元。',
  memory: 'memory pipeline のパラメータ。stage が memory を含む(memory/primary+memory/all)時のみ効く。',
  throttle:
    'Ollama。embeddings レイテンシの代理信号で COOLING を判定し、背景パイプラインの per-request 待機 + スケジューラ gate で熱を逃がす。対話 chat/検索は素通し。既定 off。',
} as const;

/** analyzer ごとの注釈。`analyzers.<id>._comment` として埋め込む。 */
const LEP_ANALYZER_COMMENTS: Record<string, string> = {
  ConversationMemoryAnalyzer: 'Layer3 memory。会話→記憶抽出。LLM依存(未到達時はPre-flightでskip)。',
  CodeMemoryAnalyzer: 'Layer3 memory。コードグラフ→記憶。LLM非依存。',
  BugHistoryMemoryAnalyzer: 'Layer3 memory。バグ履歴→記憶。LLM非依存。',
  ReviewFindingMemoryAnalyzer: 'Layer3 memory。レビュー指摘→記憶。LLM依存。',
  SpecMemoryAnalyzer: 'Layer3 memory。仕様→記憶。LLM依存。',
  DriftMemoryAnalyzer: 'Layer3 memory。drift→記憶。LLM非依存。',
  EmbeddingBackfillAnalyzer: 'Layer3 memory。未ベクトル化レコードの embedding 補完。embedding依存。',
  DoraMetricsAggregator: "Layer4 derived。DORA 指標集計。stage='all' の時のみ実行(opt-in)。",
  CrossSourceCorrelator: "Layer4 derived。クロスソース相関(PR↔commit等)。stage='all' の時のみ実行(opt-in)。",
  ReleaseResolver: 'Layer2 primary。git tag→releases 解決 + release codegraph 連動。無効化でリリース取込を停止。',
  CoverageImporter: 'Layer2 primary。カバレッジレポート取込。無効化でカバレッジ取込を停止。',
  BehaviorAnalyzer: 'Layer2 primary。ツール使用挙動の集計。無効化で behavior 解析を停止。',
  CommitFilesBackfiller: 'Layer2 primary。commit のファイル一覧補完。無効化で commit_files 補完を停止。',
  SubagentTypeBackfiller: 'Layer2 primary。subagent 種別の補完。無効化で subagent 種別補完を停止。',
  MessageCommitMatcher: 'Layer2 primary。message↔commit 紐付け。無効化で紐付けを停止。',
};

/**
 * `LepConfig` を `_comment` 注釈付きの JSON 文字列へシリアライズする (末尾改行付き)。
 *
 * 生成 (新規作成 / config.json 移行) でのみ使う。値はそのまま保持し、各セクション先頭に
 * 人間向けの注釈を差し込む。loader は `_comment` を未知キーとして無視するため round-trip に影響しない。
 */
export function serializeLepConfigWithComments(config: LepConfig): string {
  const ollama = config.llm.providers.ollama;
  const obj = {
    _comment: LEP_TOP_COMMENT,
    version: config.version,
    stage: config.stage,
    schedule: {
      _comment:
        'intervalSec=実行間隔(秒, 1800=30分) / runOnStart=拡張起動時に1回実行 / startupDelaySec=起動後この秒数待ってから初回実行',
      ...config.schedule,
    },
    llm: {
      providers: {
        ollama: {
          _comment:
            'baseUrl=ollama エンドポイント (Dev Container は host.docker.internal:11434, それ以外は localhost:11434) / models.chat=要約・抽出用 / models.embedding=ベクトル化用',
          baseUrl: ollama.baseUrl,
          models: { ...ollama.models },
        },
      },
    },
    memory: {
      _comment:
        'stage が memory を含む(memory/primary+memory/all)時のみ有効。rag=ハイブリッド検索パラメータ / fts=全文索引再構築間隔(分) / conversation=会話バックフィル日数。',
      rag: {
        _comment:
          'bm25Limit=BM25候補数 / vecLimit=ベクトル候補数 / finalLimit=RRF後の最終件数 / rrfK=RRF平滑化定数',
        ...config.memory.rag,
      },
      fts: { ...config.memory.fts },
      conversation: { ...config.memory.conversation },
    },
    analyzers: Object.fromEntries(
      Object.entries(config.analyzers).map(([id, a]) => [
        id,
        { enabled: a.enabled, _comment: LEP_ANALYZER_COMMENTS[id] ?? '' },
      ]),
    ),
    sources: {
      github: {
        _comment:
          'GitHub PR 取込。enabled=true にし tokenEnv が指す環境変数に PAT を設定すると Layer1 で PR を取り込む。maxPrs=最大取得数 / since=取得開始日(空=全期間)。',
        ...config.sources.github,
      },
      claude: {
        _comment:
          'Claude Code セッションログ(JSONL)の探索元。空文字=未指定で os.homedir()/.claude/projects を使う。WSL 等でホームと実ログ位置が異なる場合に絶対パスを指定する。',
        ...config.sources.claude,
      },
      codex: {
        _comment:
          'Codex セッションログ(rollout JSONL)の探索元。空文字=未指定で os.homedir()/.codex/sessions を使う。',
        ...config.sources.codex,
      },
      docs: {
        _comment:
          'ドキュメント検索(doc-core)の取込元ルート。例 /Shared/anytime-markdown-docs。空文字=無効(既定オフ)。設定すると daemon が spec を ingest し doc-core.db(構造/FTS/embedding)を作る。',
        ...config.sources.docs,
      },
      gitRoots: [...config.sources.gitRoots],
    },
    database: {
      _comment:
        'trail.db の保存ディレクトリ。絶対パスまたは workspace ルートからの相対パス。database 拡張は別途 anytimeDatabase.storagePath 設定を持つため両者を揃える。',
      ...config.database,
    },
    workspace: {
      _comment:
        'docsPath=C4 ドキュメントリンク用ディレクトリ。空文字=未設定。変更は Reload Window で反映。excludeRoot=code graph/C4 解析の analyze-exclude を読むディレクトリ。空文字=解析対象リポ自身にフォールバック。configPaths=commit/tool/skill カテゴリ・metrics 閾値の定義ファイルパス(空文字=内蔵デフォルト)。',
      ...config.workspace,
    },
    throttle: {
      _comment:
        'Ollama。enabled=on/off / slowdownFactor=embeddings レイテンシが直近EWMA基準×この倍を超えたらCOOLING(感度ダイヤル) / cooldownSec=COOLING窓秒(背景休止+起動時start slow) / maxContinuousMin=連続稼働上限分(超過でCOOLING)。背景パイプラインのみ対象。',
      ...config.throttle,
    },
    logs: { ...config.logs },
  };
  return JSON.stringify(obj, null, 2) + '\n';
}

export function ensureLepConfigFile(opts: EnsureLepConfigOptions): EnsureLepConfigResult {
  const path = workspaceLepConfigPath(opts.workspaceRoot);
  const migrated = mergeLepConfig(DEFAULT_LEP_CONFIG, migrateLegacyToLepConfig(opts.legacy));

  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeLepConfigWithComments(migrated), {
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
    writeFileSync(lepPath, serializeLepConfigWithComments(full), { encoding: 'utf-8' });
  } else {
    const gapFilled = applyMigratedGapsToLepJson(lepContent, lepPath, migrated, opts.logger);
    if (!gapFilled.ok) return { migrated: false, lepPath };
  }

  // config.json を保全リネーム (削除しない)。
  const renamedTo = renameConfigJson(configPath, opts.logger);
  if (!renamedTo) return { migrated: true, lepPath };

  opts.logger?.info(
    `[LepConfig] config.json を lep.json へ移行しました。config.json は ${renamedTo} に退避しました`,
  );
  return { migrated: true, lepPath, configRenamedTo: renamedTo };
}

/**
 * 既存の lep.json の内容をパースし、欠落 top-level セクションを migrated 由来値で gap-fill して書き戻す。
 * パース失敗・型不正の場合は ok:false を返す。
 */
function applyMigratedGapsToLepJson(
  lepContent: string,
  lepPath: string,
  migrated: PartialLepConfig,
  logger: MigrateConfigJsonOptions['logger'],
): { ok: boolean } {
  let lepRaw: unknown;
  try {
    lepRaw = JSON.parse(lepContent);
  } catch (err) {
    logger?.warn(
      `[LepConfig] 既存 lep.json のパースに失敗したため config.json を残します: ${lepPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { ok: false };
  }
  if (!isPlainObject(lepRaw)) {
    logger?.warn(`[LepConfig] 既存 lep.json がオブジェクトでないため config.json を残します: ${lepPath}`);
    return { ok: false };
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
  return { ok: true };
}

/** config.json を保全リネームし、rename 後パスを返す。失敗時は null。 */
function renameConfigJson(configPath: string, logger: MigrateConfigJsonOptions['logger']): string | null {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  let renamedTo = `${configPath}.migrated-${stamp}`;
  if (existsSync(renamedTo)) renamedTo = `${configPath}.migrated-${stamp}-${Date.now()}`;
  try {
    renameSync(configPath, renamedTo);
    return renamedTo;
  } catch (err) {
    logger?.warn(
      `[LepConfig] config.json の rename に失敗 (移行値は lep.json に反映済み): ${configPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
