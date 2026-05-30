import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_LEP_CONFIG,
  LepConfigError,
  disabledMemoryAnalyzerIds,
  ensureLepConfigFile,
  legacyFromConfigJson,
  loadLepConfig,
  mergeLepConfig,
  migrateConfigJsonIntoLepJson,
  migrateLegacyToLepConfig,
  resolveGitHubSource,
  resolveWorkspaceConfigPath,
  validateLepConfigInput,
  workspaceConfigJsonPath,
  workspaceLepConfigPath,
  type LepConfig,
} from '../LepConfig';

function writeJson(dir: string, name: string, obj: unknown): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(obj), 'utf-8');
  return p;
}

describe('validateLepConfigInput', () => {
  it('accepts a minimal valid object', () => {
    const { value, warnings } = validateLepConfigInput({ version: 1, stage: 'primary' }, 'test');
    expect(value.version).toBe(1);
    expect(value.stage).toBe('primary');
    expect(warnings).toEqual([]);
  });

  it('throws on non-object root', () => {
    expect(() => validateLepConfigInput(42, 'test')).toThrow(LepConfigError);
  });

  it('throws on unsupported version', () => {
    expect(() => validateLepConfigInput({ version: 2 }, 'test')).toThrow(LepConfigError);
  });

  it('throws on invalid stage', () => {
    expect(() => validateLepConfigInput({ stage: 'turbo' }, 'test')).toThrow(/stage/);
  });

  it('accepts all six stage values', () => {
    for (const stage of ['disabled', 'sources', 'primary', 'memory', 'primary+memory', 'all']) {
      expect(() => validateLepConfigInput({ stage }, 'test')).not.toThrow();
    }
  });

  it('warns on unknown top-level key but does not throw', () => {
    const { warnings } = validateLepConfigInput({ daemon: { port: 9 } }, 'test');
    expect(warnings.some((w) => w.includes('daemon'))).toBe(true);
  });

  it('warns on unknown analyzer id', () => {
    const { value, warnings } = validateLepConfigInput(
      { analyzers: { NotAnAnalyzer: { enabled: false } } },
      'test',
    );
    expect(warnings.some((w) => w.includes('NotAnAnalyzer'))).toBe(true);
    expect(value.analyzers).toEqual({});
  });

  it('extracts known analyzer toggles', () => {
    const { value } = validateLepConfigInput(
      { analyzers: { CodeMemoryAnalyzer: { enabled: false } } },
      'test',
    );
    expect(value.analyzers).toEqual({ CodeMemoryAnalyzer: { enabled: false } });
  });

  it('recognizes Layer 4 aggregator toggles without warning', () => {
    const { value, warnings } = validateLepConfigInput(
      { analyzers: { DoraMetricsAggregator: { enabled: false }, CrossSourceCorrelator: { enabled: false } } },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.analyzers).toEqual({
      DoraMetricsAggregator: { enabled: false },
      CrossSourceCorrelator: { enabled: false },
    });
  });

  it('ignores $schema without warning', () => {
    const { warnings } = validateLepConfigInput({ $schema: 'https://x', version: 1 }, 'test');
    expect(warnings).toEqual([]);
  });

  it('parses sources.github (Step 4b)', () => {
    const { value, warnings } = validateLepConfigInput(
      { sources: { github: { enabled: true, tokenEnv: 'GH_PAT', maxPrs: 50, since: '2026-01-01T00:00:00Z' } } },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.sources?.github).toEqual({
      enabled: true,
      tokenEnv: 'GH_PAT',
      maxPrs: 50,
      since: '2026-01-01T00:00:00Z',
    });
  });

  it('parses sources.claude.projectsDir / sources.codex.sessionsDir', () => {
    const { value, warnings } = validateLepConfigInput(
      { sources: { claude: { projectsDir: '/data/claude/projects' }, codex: { sessionsDir: '/data/codex/sessions' } } },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.sources?.claude).toEqual({ projectsDir: '/data/claude/projects' });
    expect(value.sources?.codex).toEqual({ sessionsDir: '/data/codex/sessions' });
  });

  it('parses github / claude / codex independently in one sources block', () => {
    const { value, warnings } = validateLepConfigInput(
      {
        sources: {
          github: { enabled: true },
          claude: { projectsDir: '/c' },
          codex: { sessionsDir: '/x' },
        },
      },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.sources?.github).toEqual({ enabled: true });
    expect(value.sources?.claude).toEqual({ projectsDir: '/c' });
    expect(value.sources?.codex).toEqual({ sessionsDir: '/x' });
  });

  it('does not warn about github when only claude is specified', () => {
    const { value, warnings } = validateLepConfigInput(
      { sources: { claude: { projectsDir: '/c' } } },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.sources?.github).toBeUndefined();
    expect(value.sources?.claude).toEqual({ projectsDir: '/c' });
  });

  it('warns when sources.claude / sources.codex are not plain objects', () => {
    const { warnings } = validateLepConfigInput(
      { sources: { claude: 'bad', codex: 5 } },
      'test',
    );
    expect(warnings.some((w) => w.includes('sources.claude'))).toBe(true);
    expect(warnings.some((w) => w.includes('sources.codex'))).toBe(true);
  });

  it('parses sources.gitRoots string array', () => {
    const { value, warnings } = validateLepConfigInput({ sources: { gitRoots: ['/a', '/b'] } }, 'test');
    expect(warnings).toEqual([]);
    expect(value.sources?.gitRoots).toEqual(['/a', '/b']);
  });

  it('warns and ignores non-string-array sources.gitRoots', () => {
    const { value, warnings } = validateLepConfigInput({ sources: { gitRoots: [1, '/b'] } }, 'test');
    expect(warnings.some((w) => w.includes('sources.gitRoots'))).toBe(true);
    expect(value.sources?.gitRoots).toBeUndefined();
  });

  it('warns on now-unknown top-level gitRoots key', () => {
    const { warnings } = validateLepConfigInput({ gitRoots: ['/a'] }, 'test');
    expect(warnings.some((w) => w.includes('gitRoots'))).toBe(true);
  });

  it('parses database.storagePath', () => {
    const { value, warnings } = validateLepConfigInput({ database: { storagePath: '/db/dir' } }, 'test');
    expect(warnings).toEqual([]);
    expect(value.database).toEqual({ storagePath: '/db/dir' });
  });

  it('parses workspace.docsPath', () => {
    const { value, warnings } = validateLepConfigInput({ workspace: { docsPath: '/docs' } }, 'test');
    expect(warnings).toEqual([]);
    expect(value.workspace).toEqual({ docsPath: '/docs' });
  });

  it('warns when database / workspace are not plain objects', () => {
    const { warnings } = validateLepConfigInput({ database: 'bad', workspace: 5 }, 'test');
    expect(warnings.some((w) => w.includes('database'))).toBe(true);
    expect(warnings.some((w) => w.includes('workspace'))).toBe(true);
  });

  it('parses memory.rag / fts / conversation', () => {
    const { value, warnings } = validateLepConfigInput(
      {
        memory: {
          rag: { bm25Limit: 10, vecLimit: 20, finalLimit: 5, rrfK: 40 },
          fts: { rebuildIntervalMinutes: 120 },
          conversation: { backfillDays: 14 },
        },
      },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.memory?.rag).toEqual({ bm25Limit: 10, vecLimit: 20, finalLimit: 5, rrfK: 40 });
    expect(value.memory?.fts).toEqual({ rebuildIntervalMinutes: 120 });
    expect(value.memory?.conversation).toEqual({ backfillDays: 14 });
  });

  it('does not warn on memory as a known top-level key', () => {
    const { warnings } = validateLepConfigInput({ memory: { rag: { bm25Limit: 1 } } }, 'test');
    expect(warnings).toEqual([]);
  });
});

describe('disabledMemoryAnalyzerIds', () => {
  it('returns empty when all analyzers enabled (default)', () => {
    expect(disabledMemoryAnalyzerIds(DEFAULT_LEP_CONFIG)).toEqual([]);
  });

  it('returns ids with enabled:false', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      analyzers: {
        ConversationMemoryAnalyzer: { enabled: false },
        EmbeddingBackfillAnalyzer: { enabled: false },
      },
    });
    expect(disabledMemoryAnalyzerIds(cfg).sort()).toEqual([
      'ConversationMemoryAnalyzer',
      'EmbeddingBackfillAnalyzer',
    ]);
  });
});

describe('resolveGitHubSource', () => {
  it('returns disabled + null token by default', () => {
    expect(DEFAULT_LEP_CONFIG.sources.github.enabled).toBe(false);
    const r = resolveGitHubSource(DEFAULT_LEP_CONFIG, {});
    expect(r).toEqual({ enabled: false, token: null, maxPrs: 30, since: undefined });
  });

  it('resolves token from the configured env var when enabled', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      sources: { github: { enabled: true, tokenEnv: 'MY_GH', since: '2026-01-01T00:00:00Z' } },
    });
    const r = resolveGitHubSource(cfg, { MY_GH: 'secret-token' });
    expect(r).toEqual({ enabled: true, token: 'secret-token', maxPrs: 30, since: '2026-01-01T00:00:00Z' });
  });

  it('returns null token when enabled but env var is unset', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      sources: { github: { enabled: true, tokenEnv: 'MISSING' } },
    });
    const r = resolveGitHubSource(cfg, {});
    expect(r.token).toBeNull();
    expect(r.enabled).toBe(true);
  });

  it('normalizes empty since to undefined', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      sources: { github: { enabled: true, since: '' } },
    });
    const r = resolveGitHubSource(cfg, { GITHUB_TOKEN: 't' });
    expect(r.since).toBeUndefined();
  });
});

describe('sources.claude / sources.codex defaults & merge', () => {
  it('defaults claude.projectsDir / codex.sessionsDir to empty string', () => {
    expect(DEFAULT_LEP_CONFIG.sources.claude.projectsDir).toBe('');
    expect(DEFAULT_LEP_CONFIG.sources.codex.sessionsDir).toBe('');
  });

  it('merges claude/codex overrides while preserving github defaults', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      sources: { claude: { projectsDir: '/p' }, codex: { sessionsDir: '/s' } },
    });
    expect(cfg.sources.claude.projectsDir).toBe('/p');
    expect(cfg.sources.codex.sessionsDir).toBe('/s');
    // github は base 既定を維持
    expect(cfg.sources.github.enabled).toBe(false);
  });
});

describe('database / workspace defaults & merge', () => {
  it('defaults database.storagePath to .anytime/trail/db and workspace.docsPath to empty', () => {
    expect(DEFAULT_LEP_CONFIG.database.storagePath).toBe('.anytime/trail/db');
    expect(DEFAULT_LEP_CONFIG.workspace.docsPath).toBe('');
  });

  it('merges database.storagePath / workspace.docsPath overrides', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      database: { storagePath: '/custom/db' },
      workspace: { docsPath: '/custom/docs' },
    });
    expect(cfg.database.storagePath).toBe('/custom/db');
    expect(cfg.workspace.docsPath).toBe('/custom/docs');
  });
});

describe('mergeLepConfig', () => {
  it('returns base when override empty', () => {
    expect(mergeLepConfig(DEFAULT_LEP_CONFIG, {})).toEqual(DEFAULT_LEP_CONFIG);
  });

  it('overrides leaf values and preserves the rest', () => {
    const merged = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      stage: 'primary+memory',
      schedule: { intervalSec: 300 },
      llm: { providers: { ollama: { models: { chat: 'llama3:8b' } } } },
    });
    expect(merged.stage).toBe('primary+memory');
    expect(merged.schedule.intervalSec).toBe(300);
    expect(merged.schedule.runOnStart).toBe(false); // default preserved
    expect(merged.llm.providers.ollama.models.chat).toBe('llama3:8b');
    expect(merged.llm.providers.ollama.models.embedding).toBe('bge-m3'); // preserved
    expect(merged.llm.providers.ollama.baseUrl).toBe('http://localhost:11434'); // preserved
  });

  it('merges analyzers per-id (unspecified ids preserved)', () => {
    const merged = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      analyzers: { ConversationMemoryAnalyzer: { enabled: false } },
    });
    expect(merged.analyzers['ConversationMemoryAnalyzer']).toEqual({ enabled: false });
    expect(merged.analyzers['CodeMemoryAnalyzer']).toEqual({ enabled: true });
  });

  it('overrides sources.gitRoots and memory leaves, preserving the rest', () => {
    const merged = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      sources: { gitRoots: ['/repo'] },
      memory: { rag: { bm25Limit: 99 }, conversation: { backfillDays: 21 } },
    });
    expect(merged.sources.gitRoots).toEqual(['/repo']);
    expect(merged.memory.rag.bm25Limit).toBe(99);
    expect(merged.memory.rag.vecLimit).toBe(30); // default preserved
    expect(merged.memory.conversation.backfillDays).toBe(21);
    expect(merged.memory.fts.rebuildIntervalMinutes).toBe(60); // default preserved
  });
});

describe('migrateLegacyToLepConfig', () => {
  it('maps analyzeAllEnabled=true to primary+memory', () => {
    expect(migrateLegacyToLepConfig({ analyzeAllEnabled: true }).stage).toBe('primary+memory');
  });

  it('maps analyzeAllEnabled=false to disabled', () => {
    expect(migrateLegacyToLepConfig({ analyzeAllEnabled: false }).stage).toBe('disabled');
  });

  it('omits stage when analyzeAllEnabled undefined', () => {
    expect(migrateLegacyToLepConfig({}).stage).toBeUndefined();
  });

  it('maps analyzeAll schedule fields', () => {
    const out = migrateLegacyToLepConfig({
      analyzeAll: { intervalSec: 600, runOnStart: true, startupDelaySec: 5 },
    });
    expect(out.schedule).toEqual({ intervalSec: 600, runOnStart: true, startupDelaySec: 5 });
  });

  it('maps ollama baseUrl and models', () => {
    const out = migrateLegacyToLepConfig({
      ollamaBaseUrl: 'http://host.docker.internal:11434',
      chatModel: 'qwen2.5-coder:14b',
      embeddingModel: 'bge-m3',
    });
    expect(out.llm?.providers?.ollama?.baseUrl).toBe('http://host.docker.internal:11434');
    expect(out.llm?.providers?.ollama?.models).toEqual({ chat: 'qwen2.5-coder:14b', embedding: 'bge-m3' });
  });

  it('maps gitRoots / rag / fts / backfillDays', () => {
    const out = migrateLegacyToLepConfig({
      gitRoots: ['/x'],
      rag: { bm25Limit: 11, vecLimit: 22, finalLimit: 6, rrfK: 50 },
      fts: { rebuildIntervalMinutes: 90 },
      backfillDays: 7,
    });
    expect(out.sources?.gitRoots).toEqual(['/x']);
    expect(out.memory?.rag).toEqual({ bm25Limit: 11, vecLimit: 22, finalLimit: 6, rrfK: 50 });
    expect(out.memory?.fts).toEqual({ rebuildIntervalMinutes: 90 });
    expect(out.memory?.conversation).toEqual({ backfillDays: 7 });
  });

  it('omits gitRoots / memory when not provided', () => {
    const out = migrateLegacyToLepConfig({ analyzeAllEnabled: true });
    expect(out.sources?.gitRoots).toBeUndefined();
    expect(out.memory).toBeUndefined();
  });

  it('preserves behaviour: enabled=true legacy user migrates to primary+memory schedule', () => {
    const merged = mergeLepConfig(
      DEFAULT_LEP_CONFIG,
      migrateLegacyToLepConfig({
        analyzeAllEnabled: true,
        analyzeAll: { intervalSec: 1800, runOnStart: false, startupDelaySec: 30 },
      }),
    );
    expect(merged.stage).toBe('primary+memory');
    expect(merged.schedule).toEqual({ intervalSec: 1800, runOnStart: false, startupDelaySec: 30 });
  });
});

describe('loadLepConfig', () => {
  let root: string;
  let home: string;
  let ws: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lepcfg-'));
    home = join(root, 'home');
    ws = join(root, 'ws');
    mkdirSync(home, { recursive: true });
    mkdirSync(ws, { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns built-in default when no files exist', () => {
    const { config, loadedPaths } = loadLepConfig({ workspaceRoot: ws, homeDir: home });
    expect(config).toEqual(DEFAULT_LEP_CONFIG);
    expect(loadedPaths).toEqual([]);
  });

  it('loads workspace lep.json over default', () => {
    writeJson(join(ws, '.anytime', 'trail'), 'lep.json', { version: 1, stage: 'primary' });
    const { config, loadedPaths } = loadLepConfig({ workspaceRoot: ws, homeDir: home });
    expect(config.stage).toBe('primary');
    expect(loadedPaths).toHaveLength(1);
  });

  it('lep.local.json overrides lep.json (local precedence highest)', () => {
    writeJson(join(ws, '.anytime', 'trail'), 'lep.json', { stage: 'primary' });
    writeJson(join(ws, '.anytime', 'trail'), 'lep.local.json', { stage: 'primary+memory' });
    const { config } = loadLepConfig({ workspaceRoot: ws, homeDir: home });
    expect(config.stage).toBe('primary+memory');
  });

  it('workspace lep.json overrides global home lep.json', () => {
    writeJson(join(home, '.anytime', 'trail'), 'lep.json', { stage: 'sources' });
    writeJson(join(ws, '.anytime', 'trail'), 'lep.json', { stage: 'primary' });
    const { config } = loadLepConfig({ workspaceRoot: ws, homeDir: home });
    expect(config.stage).toBe('primary');
  });

  it('deep merges leaf values across tiers', () => {
    writeJson(join(home, '.anytime', 'trail'), 'lep.json', {
      schedule: { intervalSec: 900 },
    });
    writeJson(join(ws, '.anytime', 'trail'), 'lep.json', {
      stage: 'primary+memory',
      llm: { providers: { ollama: { baseUrl: 'http://x:1' } } },
    });
    const { config } = loadLepConfig({ workspaceRoot: ws, homeDir: home });
    expect(config.stage).toBe('primary+memory');
    expect(config.schedule.intervalSec).toBe(900); // from home
    expect(config.llm.providers.ollama.baseUrl).toBe('http://x:1'); // from ws
    expect(config.schedule.runOnStart).toBe(false); // default
  });

  it('throws LepConfigError on invalid stage in a file', () => {
    writeJson(join(ws, '.anytime', 'trail'), 'lep.json', { stage: 'nope' });
    expect(() => loadLepConfig({ workspaceRoot: ws, homeDir: home })).toThrow(LepConfigError);
  });

  it('warns and skips a malformed JSON file', () => {
    const dir = join(ws, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'lep.json'), '{ not json', 'utf-8');
    const { config, warnings } = loadLepConfig({ workspaceRoot: ws, homeDir: home });
    expect(config).toEqual(DEFAULT_LEP_CONFIG);
    expect(warnings.some((w) => w.includes('パース'))).toBe(true);
  });

  it('configPathOverride reads only the override file', () => {
    const override = writeJson(root, 'custom-lep.json', { stage: 'memory' });
    writeJson(join(ws, '.anytime', 'trail'), 'lep.json', { stage: 'primary' });
    const { config, loadedPaths } = loadLepConfig({
      workspaceRoot: ws,
      homeDir: home,
      configPathOverride: override,
    });
    expect(config.stage).toBe('memory');
    expect(loadedPaths).toEqual([override]);
  });
});

describe('ensureLepConfigFile', () => {
  let ws: string;
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'lepensure-'));
  });
  afterEach(() => rmSync(ws, { recursive: true, force: true }));

  it('creates lep.json from legacy when absent', () => {
    const res = ensureLepConfigFile({ workspaceRoot: ws, legacy: { analyzeAllEnabled: true } });
    expect(res.created).toBe(true);
    const written = JSON.parse(readFileSync(res.path, 'utf-8')) as LepConfig;
    expect(written.stage).toBe('primary+memory');
    expect(written.version).toBe(1);
  });

  it('does not overwrite an existing lep.json', () => {
    const p = workspaceLepConfigPath(ws);
    mkdirSync(join(ws, '.anytime', 'trail'), { recursive: true });
    writeFileSync(p, JSON.stringify({ stage: 'sources' }), 'utf-8');
    const before = readFileSync(p, 'utf-8');
    const res = ensureLepConfigFile({ workspaceRoot: ws, legacy: { analyzeAllEnabled: true } });
    expect(res.created).toBe(false);
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  it('round-trips through loadLepConfig', () => {
    ensureLepConfigFile({ workspaceRoot: ws, legacy: { analyzeAllEnabled: false } });
    const { config } = loadLepConfig({ workspaceRoot: ws, homeDir: join(ws, 'nonexistent-home') });
    expect(config.stage).toBe('disabled');
    expect(existsSync(workspaceLepConfigPath(ws))).toBe(true);
  });
});

describe('legacyFromConfigJson', () => {
  it('maps a full config.json shape', () => {
    const out = legacyFromConfigJson({
      schemaVersion: 1,
      gitRoots: ['/repo'],
      analyzeAll: { intervalSec: 1800, runOnStart: true, startupDelaySec: 30 },
      memory: {
        ollama: { baseUrl: 'http://host.docker.internal:11434' },
        chat: { model: 'qwen2.5:7b' },
        embedding: { model: 'bge-m3:latest' },
        rag: { bm25Limit: 30, vecLimit: 30, finalLimit: 12, rrfK: 60 },
        fts: { rebuildIntervalMinutes: 60 },
        conversation: { backfillDays: 10 },
      },
    });
    expect(out.analyzeAll).toEqual({ intervalSec: 1800, runOnStart: true, startupDelaySec: 30 });
    expect(out.gitRoots).toEqual(['/repo']);
    expect(out.ollamaBaseUrl).toBe('http://host.docker.internal:11434');
    expect(out.chatModel).toBe('qwen2.5:7b');
    expect(out.embeddingModel).toBe('bge-m3:latest');
    expect(out.rag).toEqual({ bm25Limit: 30, vecLimit: 30, finalLimit: 12, rrfK: 60 });
    expect(out.fts).toEqual({ rebuildIntervalMinutes: 60 });
    expect(out.backfillDays).toBe(10);
  });

  it('returns empty object for non-object input', () => {
    expect(legacyFromConfigJson(null)).toEqual({});
    expect(legacyFromConfigJson(42)).toEqual({});
  });
});

describe('migrateConfigJsonIntoLepJson', () => {
  let ws: string;
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'lepmigrate-'));
  });
  afterEach(() => rmSync(ws, { recursive: true, force: true }));

  function writeConfigJson(obj: unknown): void {
    writeJson(join(ws, '.anytime', 'trail'), 'config.json', obj);
  }

  it('no-op when config.json absent', () => {
    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws });
    expect(res.migrated).toBe(false);
    expect(existsSync(workspaceLepConfigPath(ws))).toBe(false);
  });

  it('creates lep.json from config.json when lep.json absent, then renames config.json', () => {
    writeConfigJson({
      gitRoots: ['/repo'],
      analyzeAll: { intervalSec: 600, runOnStart: true, startupDelaySec: 5 },
      memory: {
        ollama: { baseUrl: 'http://host.docker.internal:11434' },
        chat: { model: 'qwen2.5:7b' },
        embedding: { model: 'bge-m3:latest' },
        rag: { bm25Limit: 15, vecLimit: 25, finalLimit: 8, rrfK: 50 },
        fts: { rebuildIntervalMinutes: 120 },
        conversation: { backfillDays: 14 },
      },
    });
    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws, analyzeAllEnabled: true });
    expect(res.migrated).toBe(true);
    expect(existsSync(workspaceConfigJsonPath(ws))).toBe(false); // renamed away
    expect(res.configRenamedTo && existsSync(res.configRenamedTo)).toBe(true);

    const { config } = loadLepConfig({ workspaceRoot: ws, homeDir: join(ws, 'nohome') });
    expect(config.stage).toBe('primary+memory');
    expect(config.sources.gitRoots).toEqual(['/repo']);
    expect(config.schedule).toEqual({ intervalSec: 600, runOnStart: true, startupDelaySec: 5 });
    expect(config.llm.providers.ollama.baseUrl).toBe('http://host.docker.internal:11434');
    expect(config.memory.rag.bm25Limit).toBe(15);
    expect(config.memory.fts.rebuildIntervalMinutes).toBe(120);
    expect(config.memory.conversation.backfillDays).toBe(14);
  });

  it('gap-fills only missing sections of an existing lep.json (existing values win)', () => {
    // lep.json already has schedule + llm + stage; lacks memory + gitRoots.
    writeJson(join(ws, '.anytime', 'trail'), 'lep.json', {
      version: 1,
      stage: 'primary+memory',
      schedule: { intervalSec: 1800, runOnStart: true, startupDelaySec: 30 },
      llm: { providers: { ollama: { baseUrl: 'http://host.docker.internal:11434', models: { chat: 'qwen2.5:7b', embedding: 'bge-m3:latest' } } } },
    });
    writeConfigJson({
      gitRoots: ['/repo'],
      analyzeAll: { intervalSec: 99, runOnStart: false, startupDelaySec: 99 }, // must NOT override existing schedule
      memory: {
        ollama: { baseUrl: 'http://other:1' }, // must NOT override existing llm
        rag: { bm25Limit: 15, vecLimit: 25, finalLimit: 8, rrfK: 50 },
        fts: { rebuildIntervalMinutes: 120 },
        conversation: { backfillDays: 14 },
      },
    });
    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws });
    expect(res.migrated).toBe(true);

    const { config } = loadLepConfig({ workspaceRoot: ws, homeDir: join(ws, 'nohome') });
    // existing sections preserved
    expect(config.schedule).toEqual({ intervalSec: 1800, runOnStart: true, startupDelaySec: 30 });
    expect(config.llm.providers.ollama.baseUrl).toBe('http://host.docker.internal:11434');
    // missing sections gap-filled from config.json
    expect(config.sources.gitRoots).toEqual(['/repo']);
    expect(config.memory.rag.bm25Limit).toBe(15);
    expect(config.memory.fts.rebuildIntervalMinutes).toBe(120);
    expect(config.memory.conversation.backfillDays).toBe(14);
  });

  it('is idempotent: second call is a no-op (config.json already renamed)', () => {
    writeConfigJson({ memory: { conversation: { backfillDays: 14 } } });
    const first = migrateConfigJsonIntoLepJson({ workspaceRoot: ws });
    expect(first.migrated).toBe(true);
    const second = migrateConfigJsonIntoLepJson({ workspaceRoot: ws });
    expect(second.migrated).toBe(false);
  });

  it('does not rename config.json when existing lep.json is malformed', () => {
    const dir = join(ws, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'lep.json'), '{ not json', 'utf-8');
    writeConfigJson({ memory: { conversation: { backfillDays: 14 } } });
    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws });
    expect(res.migrated).toBe(false);
    expect(existsSync(workspaceConfigJsonPath(ws))).toBe(true); // preserved for user to fix
  });
});

describe('resolveWorkspaceConfigPath', () => {
  it('空文字は workspace 相対の既定 .anytime/<file> を絶対化する', () => {
    expect(resolveWorkspaceConfigPath(DEFAULT_LEP_CONFIG, 'commitCategories', '/work/repo')).toBe(
      join('/work/repo', '.anytime', 'commit-categories.json'),
    );
    expect(resolveWorkspaceConfigPath(DEFAULT_LEP_CONFIG, 'metricsThresholds', '/work/repo')).toBe(
      join('/work/repo', '.anytime', 'metrics-thresholds.yaml'),
    );
  });

  it('絶対パス指定はそのまま返す', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      workspace: { configPaths: { toolCategories: '/etc/anytime/tools.json' } },
    });
    expect(resolveWorkspaceConfigPath(cfg, 'toolCategories', '/work/repo')).toBe('/etc/anytime/tools.json');
  });

  it('相対パス指定は workspaceRoot 起点で絶対化する', () => {
    const cfg = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      workspace: { configPaths: { skillCategories: 'config/skills.json' } },
    });
    expect(resolveWorkspaceConfigPath(cfg, 'skillCategories', '/work/repo')).toBe(
      join('/work/repo', 'config/skills.json'),
    );
  });

  it('workspaceRoot 未指定 + 相対 は undefined を返す', () => {
    expect(resolveWorkspaceConfigPath(DEFAULT_LEP_CONFIG, 'commitCategories', undefined)).toBeUndefined();
  });

  it('validate → merge で configPaths が往復する', () => {
    const { value } = validateLepConfigInput(
      { workspace: { configPaths: { commitCategories: '/abs/commit.json' } } },
      'test',
    );
    const merged = mergeLepConfig(DEFAULT_LEP_CONFIG, value);
    expect(merged.workspace.configPaths.commitCategories).toBe('/abs/commit.json');
    // 未指定キーは既定 (空文字) を維持
    expect(merged.workspace.configPaths.toolCategories).toBe('');
  });
});
