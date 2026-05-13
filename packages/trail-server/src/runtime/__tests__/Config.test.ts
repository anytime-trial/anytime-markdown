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
    expect(cfg.gitRoots).toEqual([]);
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
