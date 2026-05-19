import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_LEP_CONFIG,
  LepConfigError,
  ensureLepConfigFile,
  loadLepConfig,
  mergeLepConfig,
  migrateLegacyToLepConfig,
  validateLepConfigInput,
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

  it('ignores $schema without warning', () => {
    const { warnings } = validateLepConfigInput({ $schema: 'https://x', version: 1 }, 'test');
    expect(warnings).toEqual([]);
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
