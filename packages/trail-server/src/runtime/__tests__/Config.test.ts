import { loadConfig, type TrailServerConfig } from '../Config';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8'));
}

describe('loadConfig', () => {
  let dir: string;
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trail-config-'));
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dir, { recursive: true });
    warnSpy.mockRestore();
  });

  // ---- defaults ----

  it('returns defaults when file missing (and auto-generates the file)', () => {
    const p = join(dir, 'config.json');
    expect(existsSync(p)).toBe(false);
    const cfg = loadConfig(p);
    expect(cfg.schemaVersion).toBe(3);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
    expect(cfg.analyzeAll.runOnStart).toBe(false);
    expect(cfg.analyzeAll.startupDelaySec).toBe(30);
    expect(cfg.gitRoots).toEqual([]);

    // 副作用: ファイルが自動生成されている
    expect(existsSync(p)).toBe(true);
    const round = JSON.parse(readFileSync(p, 'utf-8')) as TrailServerConfig;
    expect(round.schemaVersion).toBe(3);
    expect(round.analyzeAll.runOnStart).toBe(false);
    expect(round.analyzeAll.startupDelaySec).toBe(30);
  });

  it('creates parent directory when generating default', () => {
    const p = join(dir, 'nested', 'deep', 'config.json');
    expect(existsSync(p)).toBe(false);
    loadConfig(p);
    expect(existsSync(p)).toBe(true);
  });

  it('does not regenerate when file already exists', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({ schemaVersion: 3, analyzeAll: { intervalSec: 9999 } }));
    const before = readFileSync(p, 'utf-8');
    loadConfig(p);
    const after = readFileSync(p, 'utf-8');
    expect(after).toBe(before); // 上書きされない
  });

  it('returns defaults when JSON is malformed', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{ this is not json');
    const cfg = loadConfig(p);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to parse'));
  });

  it('fills all memory defaults when file is empty object', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{}');
    const cfg = loadConfig(p);
    expect(cfg.memory.ollama.baseUrl).toBe('http://localhost:11434');
    expect(cfg.memory.chat.model).toBe('qwen2.5-coder:14b');
    expect(cfg.memory.embedding.model).toBe('bge-m3');
    expect(cfg.memory.rag.bm25Limit).toBe(30);
    expect(cfg.memory.rag.vecLimit).toBe(30);
    expect(cfg.memory.rag.finalLimit).toBe(12);
    expect(cfg.memory.rag.rrfK).toBe(60);
    expect(cfg.memory.fts.rebuildIntervalMinutes).toBe(60);
    expect(cfg.memory.conversation.backfillDays).toBe(5);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
    expect(cfg.analyzeAll.runOnStart).toBe(false);
    expect(cfg.analyzeAll.startupDelaySec).toBe(30);
  });

  it('merges file values over defaults', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      gitRoots: ['/a', '/b'],
      analyzeAll: { intervalSec: 300, runOnStart: true },
    }));
    const cfg = loadConfig(p);
    expect(cfg.gitRoots).toEqual(['/a', '/b']);
    expect(cfg.analyzeAll.intervalSec).toBe(300);
    expect(cfg.analyzeAll.runOnStart).toBe(true);
    expect(cfg.analyzeAll.startupDelaySec).toBe(30); // default 維持
  });

  it('partial memory.chat.model override preserves other defaults', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      memory: { chat: { model: 'llama3:8b' } },
    }));
    const cfg = loadConfig(p);
    expect(cfg.memory.chat.model).toBe('llama3:8b');
    expect(cfg.memory.ollama.baseUrl).toBe('http://localhost:11434');
    expect(cfg.memory.embedding.model).toBe('bge-m3');
    expect(cfg.memory.rag.bm25Limit).toBe(30);
    expect(cfg.memory.fts.rebuildIntervalMinutes).toBe(60);
    expect(cfg.memory.conversation.backfillDays).toBe(5);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
  });

  it('all memory subsections support partial override independently', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      analyzeAll: { intervalSec: 3600 },
      memory: {
        ollama: { baseUrl: 'http://custom:11434' },
        embedding: { model: 'nomic-embed-text' },
        rag: { rrfK: 100 },
        fts: { rebuildIntervalMinutes: 30 },
        conversation: { backfillDays: 14 },
      },
    }));
    const cfg = loadConfig(p);
    expect(cfg.memory.ollama.baseUrl).toBe('http://custom:11434');
    expect(cfg.memory.chat.model).toBe('qwen2.5-coder:14b'); // default preserved
    expect(cfg.memory.embedding.model).toBe('nomic-embed-text');
    expect(cfg.memory.rag.rrfK).toBe(100);
    expect(cfg.memory.rag.bm25Limit).toBe(30); // default preserved
    expect(cfg.memory.fts.rebuildIntervalMinutes).toBe(30);
    expect(cfg.memory.conversation.backfillDays).toBe(14);
    expect(cfg.analyzeAll.intervalSec).toBe(3600);
    expect(cfg.analyzeAll.runOnStart).toBe(false); // default preserved
  });

  // ---- v3 ----

  it('v3 config without legacy fields works with defaults and overrides', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify(loadFixture('config-v3.json')));
    const cfg = loadConfig(p);
    expect(cfg.schemaVersion).toBe(3);
    expect(cfg.gitRoots).toEqual(['/repo']);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
    expect(cfg.memory.ollama.baseUrl).toBe('http://host.docker.internal:11434');
    expect(cfg.memory.rag.finalLimit).toBe(20);
    expect(cfg.memory.rag.bm25Limit).toBe(30); // default preserved
    expect(cfg.memory.chat.model).toBe('qwen2.5-coder:14b');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ---- v2 migration: memory.ingest -> analyzeAll ----

  it('v2 config: migrates memory.ingest to analyzeAll', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify(loadFixture('config-v2.json')));
    const cfg = loadConfig(p);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
    expect(cfg.analyzeAll.runOnStart).toBe(true);
    expect(cfg.analyzeAll.startupDelaySec).toBe(5);
    // memory.ingest は output schema に存在しない
    expect((cfg as TrailServerConfig & { memory: { ingest?: unknown } }).memory.ingest).toBeUndefined();
  });

  it('v2 config emits deprecation warnings', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 2,
      memory: {
        ingest: { intervalSec: 900, runOnStart: false, startupDelaySec: 10 },
      },
    }));
    loadConfig(p);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain('schemaVersion 2');
    expect(warnSpy.mock.calls[1][0]).toContain('memory.ingest is deprecated');
  });

  it('v2 config with both memory.ingest AND analyzeAll: explicit analyzeAll wins', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 2,
      memory: {
        ingest: { intervalSec: 900, runOnStart: false, startupDelaySec: 10 },
      },
      analyzeAll: { intervalSec: 600 },
    }));
    const cfg = loadConfig(p);
    expect(cfg.analyzeAll.intervalSec).toBe(600);
    expect(cfg.analyzeAll.runOnStart).toBe(false);
    expect(cfg.analyzeAll.startupDelaySec).toBe(10);
  });

  // ---- v1 migration: scheduler.memoryCore -> analyzeAll ----

  it('v1 config: migrates scheduler.memoryCore to analyzeAll', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify(loadFixture('config-v1.json')));
    const cfg = loadConfig(p);
    expect(cfg.analyzeAll.intervalSec).toBe(900);
    expect(cfg.analyzeAll.runOnStart).toBe(false);
    expect(cfg.analyzeAll.startupDelaySec).toBe(10);
  });

  it('v1 config emits deprecation warnings', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 1,
      scheduler: {
        memoryCore: { intervalSec: 900, runOnStart: true, startupDelaySec: 5 },
      },
    }));
    loadConfig(p);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain('schemaVersion 1');
    expect(warnSpy.mock.calls[1][0]).toContain('scheduler.memoryCore is deprecated');
  });

  it('v1 config with both scheduler.memoryCore AND analyzeAll: explicit analyzeAll wins', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 1,
      scheduler: {
        memoryCore: { intervalSec: 900, runOnStart: false, startupDelaySec: 10 },
      },
      analyzeAll: { intervalSec: 600 },
    }));
    const cfg = loadConfig(p);
    expect(cfg.analyzeAll.intervalSec).toBe(600);
    expect(cfg.analyzeAll.runOnStart).toBe(false);
    expect(cfg.analyzeAll.startupDelaySec).toBe(10);
  });

  it('schema does not expose scheduler field in output', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{}');
    const cfg = loadConfig(p);
    expect((cfg as TrailServerConfig & { scheduler?: unknown }).scheduler).toBeUndefined();
  });
});
