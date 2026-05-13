import { loadConfig, type TrailServerConfig } from '../Config';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('loadConfig', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'trail-config-')); });
  afterEach(() => rmSync(dir, { recursive: true }));

  it('returns defaults when file missing', () => {
    const cfg = loadConfig(join(dir, 'config.json'));
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.scheduler.periodicImport.intervalSec).toBe(60);
    expect(cfg.scheduler.periodicImport.runOnStart).toBe(true);
    expect(cfg.scheduler.memoryCore.intervalSec).toBe(1800);
    expect(cfg.scheduler.memoryCore.runOnStart).toBe(true);
    expect(cfg.scheduler.memoryCore.startupDelaySec).toBe(5);
    expect(cfg.gitRoots).toEqual([]);
  });

  it('merges scheduler.memoryCore overrides', () => {
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
});
