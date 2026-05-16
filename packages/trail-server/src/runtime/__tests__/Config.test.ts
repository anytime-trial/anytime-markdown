import { loadConfig, type TrailServerConfig } from '../Config';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('returns defaults when file missing (and auto-generates the file)', () => {
    const p = join(dir, 'config.json');
    expect(existsSync(p)).toBe(false);
    const cfg = loadConfig(p);
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
    expect(cfg.analyzeAll.runOnStart).toBe(false);
    expect(cfg.analyzeAll.startupDelaySec).toBe(30);
    expect(cfg.gitRoots).toEqual([]);

    // 副作用: ファイルが自動生成されている
    expect(existsSync(p)).toBe(true);
    const round = JSON.parse(readFileSync(p, 'utf-8')) as TrailServerConfig;
    expect(round.schemaVersion).toBe(1);
    expect(round.analyzeAll.runOnStart).toBe(false);
    expect(round.analyzeAll.startupDelaySec).toBe(30);
  });

  it('creates parent directory when generating default', () => {
    const p = join(dir, 'nested', 'deep', 'config.json');
    loadConfig(p);
    expect(existsSync(p)).toBe(true);
  });

  it('does not regenerate when file already exists', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({ schemaVersion: 1, analyzeAll: { intervalSec: 9999 } }));
    const before = readFileSync(p, 'utf-8');
    loadConfig(p);
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  it('returns defaults when JSON is malformed', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{ this is not json');
    const cfg = loadConfig(p);
    expect(cfg.analyzeAll.intervalSec).toBe(1800);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to parse'));
  });

  it('fills all defaults when file is empty object', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{}');
    const cfg = loadConfig(p);
    expect(cfg.schemaVersion).toBe(1);
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

  it('schema does not expose scheduler field in output', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, '{}');
    const cfg = loadConfig(p);
    expect((cfg as TrailServerConfig & { scheduler?: unknown }).scheduler).toBeUndefined();
  });

  it('silently ignores unknown legacy fields (no migration)', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      schemaVersion: 99,
      scheduler: { memoryCore: { intervalSec: 900 } }, // 旧 v1 形式 — 無視される
      memory: { ingest: { intervalSec: 600 } },         // 旧 v2 形式 — 無視される
      analyzeAll: { intervalSec: 1234 },
    }));
    const cfg = loadConfig(p);
    expect(cfg.analyzeAll.intervalSec).toBe(1234);
    expect(cfg.analyzeAll.runOnStart).toBe(false); // default
    expect(warnSpy).not.toHaveBeenCalled(); // マイグレーション WARN なし
  });
});
