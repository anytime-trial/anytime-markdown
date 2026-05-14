import { loadConfig, type TrailServerConfig } from '../Config';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  // ---- existing tests (updated for schemaVersion 2) ----

  it('returns defaults when file missing', () => {
    const cfg = loadConfig(join(dir, 'config.json'));
    expect(cfg.schemaVersion).toBe(2);
    expect(cfg.scheduler.periodicImport.intervalSec).toBe(60);
    expect(cfg.scheduler.periodicImport.runOnStart).toBe(true);
    expect(cfg.scheduler.memoryCore.intervalSec).toBe(1800);
    expect(cfg.scheduler.memoryCore.runOnStart).toBe(true);
    expect(cfg.scheduler.memoryCore.startupDelaySec).toBe(5);
    expect(cfg.gitRoots).toEqual([]);
  });

  it('merges scheduler.memoryCore overrides (legacy field kept)', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      scheduler: { memoryCore: { intervalSec: 600, runOnStart: false } },
    }));
    const cfg = loadConfig(p);
    expect(cfg.scheduler.memoryCore.intervalSec).toBe(600);
    expect(cfg.scheduler.memoryCore.runOnStart).toBe(false);
    // unspecified field falls back to defaults
    expect(cfg.scheduler.memoryCore.startupDelaySec).toBe(5);
  });

  it('merges file values over defaults', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      gitRoots: ['/a', '/b'],
      scheduler: { periodicImport: { intervalSec: 300 } },
    }));
    const cfg = loadConfig(p);
    expect(cfg.gitRoots).toEqual(['/a', '/b']);
    expect(cfg.scheduler.periodicImport.intervalSec).toBe(300);
    expect(cfg.scheduler.periodicImport.runOnStart).toBe(true);
  });

  it('returns defaults when JSON is malformed', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{ this is not json');
    const cfg = loadConfig(p);
    expect(cfg.scheduler.periodicImport.intervalSec).toBe(60);
  });

  // ---- new tests for schemaVersion 2 and memory.* ----

  it('returns schemaVersion 2 by default', () => {
    const cfg = loadConfig(join(dir, 'config.json'));
    expect(cfg.schemaVersion).toBe(2);
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
    expect(cfg.memory.ingest.intervalSec).toBe(1800);
    expect(cfg.memory.ingest.runOnStart).toBe(true);
    expect(cfg.memory.ingest.startupDelaySec).toBe(5);
    expect(cfg.memory.conversation.backfillDays).toBe(5);
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
    expect(cfg.memory.ingest.intervalSec).toBe(1800);
    expect(cfg.memory.conversation.backfillDays).toBe(5);
  });

  it('v1 config: migrates scheduler.memoryCore to memory.ingest', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 1,
      scheduler: {
        periodicImport: { intervalSec: 60, runOnStart: true, startupDelaySec: 5 },
        memoryCore: { intervalSec: 900, runOnStart: false, startupDelaySec: 10 },
      },
    }));
    const cfg = loadConfig(p);
    expect(cfg.memory.ingest.intervalSec).toBe(900);
    expect(cfg.memory.ingest.runOnStart).toBe(false);
    expect(cfg.memory.ingest.startupDelaySec).toBe(10);
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
    expect(warnSpy).toHaveBeenCalled();
  });

  it('v1 config with both scheduler.memoryCore AND memory.ingest: user memory.ingest wins', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 1,
      scheduler: {
        memoryCore: { intervalSec: 900, runOnStart: false, startupDelaySec: 10 },
      },
      memory: {
        ingest: { intervalSec: 600 },
      },
    }));
    const cfg = loadConfig(p);
    // explicit memory.ingest.intervalSec wins
    expect(cfg.memory.ingest.intervalSec).toBe(600);
    // memory.ingest fields not in memory.ingest override get from scheduler.memoryCore migration
    expect(cfg.memory.ingest.runOnStart).toBe(false);
    expect(cfg.memory.ingest.startupDelaySec).toBe(10);
  });

  it('v2 config without legacy fields works with defaults and overrides', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 2,
      gitRoots: ['/repo'],
      memory: {
        ollama: { baseUrl: 'http://host.docker.internal:11434' },
        rag: { finalLimit: 20 },
      },
    }));
    const cfg = loadConfig(p);
    expect(cfg.schemaVersion).toBe(2);
    expect(cfg.gitRoots).toEqual(['/repo']);
    expect(cfg.memory.ollama.baseUrl).toBe('http://host.docker.internal:11434');
    expect(cfg.memory.rag.finalLimit).toBe(20);
    expect(cfg.memory.rag.bm25Limit).toBe(30);
    expect(cfg.memory.chat.model).toBe('qwen2.5-coder:14b');
    expect(cfg.memory.embedding.model).toBe('bge-m3');
    expect(cfg.memory.fts.rebuildIntervalMinutes).toBe(60);
    expect(cfg.memory.ingest.intervalSec).toBe(1800);
    expect(cfg.memory.conversation.backfillDays).toBe(5);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('all memory subsections support partial override independently', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      memory: {
        ollama: { baseUrl: 'http://custom:11434' },
        embedding: { model: 'nomic-embed-text' },
        rag: { rrfK: 100 },
        fts: { rebuildIntervalMinutes: 30 },
        ingest: { intervalSec: 3600 },
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
    expect(cfg.memory.ingest.intervalSec).toBe(3600);
    expect(cfg.memory.ingest.runOnStart).toBe(true); // default preserved
    expect(cfg.memory.conversation.backfillDays).toBe(14);
  });
});
