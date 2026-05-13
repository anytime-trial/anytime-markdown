import { DaemonLifecycle, type DaemonInfo } from '../DaemonLifecycle';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeInfo(overrides: Partial<DaemonInfo> = {}): DaemonInfo {
  return {
    schemaVersion: 1,
    pid: 12345,
    host: '127.0.0.1',
    port: 47823,
    url: 'http://127.0.0.1:47823',
    version: '0.18.0',
    startedAt: '2026-05-13T12:34:56.789Z',
    startedBy: 'cli',
    dbPath: '/tmp/trail.db',
    gitRoots: ['/repo'],
    viewerDistPath: '/tmp/viewer',
    pidStartTime: 0,
    ...overrides,
  };
}

describe('DaemonLifecycle', () => {
  let dir: string;
  let jsonPath: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trail-lifecycle-'));
    jsonPath = join(dir, 'daemon.json');
    lockPath = join(dir, 'daemon.lock');
  });
  afterEach(() => rmSync(dir, { recursive: true }));

  it('writeDaemonJson and readDaemonJson roundtrip', () => {
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    const info = makeInfo({ pid: 12345, port: 47823 });
    lc.writeDaemonJson(info);
    const read = lc.readDaemonJson();
    expect(read?.pid).toBe(12345);
    expect(read?.port).toBe(47823);
  });

  it('returns undefined when daemon.json missing', () => {
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    expect(lc.readDaemonJson()).toBeUndefined();
  });

  it('detects stale daemon.json when pid does not exist', () => {
    writeFileSync(jsonPath, JSON.stringify(makeInfo({ pid: 99999999 })));
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    expect(lc.isDaemonAlive()).toBe(false);
  });

  it('detects alive daemon.json when pid is current process', () => {
    writeFileSync(jsonPath, JSON.stringify(makeInfo({ pid: process.pid })));
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    expect(lc.isDaemonAlive()).toBe(true);
  });

  it('removeDaemonJson deletes the file', () => {
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    lc.writeDaemonJson(makeInfo());
    expect(existsSync(jsonPath)).toBe(true);
    lc.removeDaemonJson();
    expect(existsSync(jsonPath)).toBe(false);
  });
});
