/**
 * Additional coverage for DaemonLifecycle.ts:
 * - readDaemonJson: malformed JSON → returns undefined (line 33)
 * - isDaemonAlive: EPERM path → alive = true
 */
import { DaemonLifecycle, type DaemonInfo } from '../DaemonLifecycle';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

describe('DaemonLifecycle — additional coverage', () => {
  let dir: string;
  let jsonPath: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'trail-lifecycle-add-'));
    jsonPath = join(dir, 'daemon.json');
    lockPath = join(dir, 'daemon.lock');
  });
  afterEach(() => rmSync(dir, { recursive: true }));

  it('readDaemonJson returns undefined when file contains invalid JSON', () => {
    writeFileSync(jsonPath, '{ not valid json', 'utf-8');
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    expect(lc.readDaemonJson()).toBeUndefined();
  });

  it('isDaemonAlive returns true for EPERM (process owned by another user)', () => {
    // EPERM means process exists but we cannot signal it → alive
    const spy = jest.spyOn(process, 'kill').mockImplementationOnce(() => {
      const err: NodeJS.ErrnoException = new Error('EPERM');
      err.code = 'EPERM';
      throw err;
    });
    try {
      writeFileSync(jsonPath, JSON.stringify(makeInfo({ pid: 1 })));
      const lc = new DaemonLifecycle({ jsonPath, lockPath });
      expect(lc.isDaemonAlive()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('writeDaemonJson creates parent directory if missing', () => {
    const deepJsonPath = join(dir, 'nested', 'dir', 'daemon.json');
    const lc = new DaemonLifecycle({ jsonPath: deepJsonPath, lockPath });
    const info = makeInfo({ pid: 99 });
    lc.writeDaemonJson(info);
    const read = lc.readDaemonJson();
    expect(read?.pid).toBe(99);
  });

  it('removeDaemonJson is a no-op when file does not exist', () => {
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    // Should not throw
    expect(() => lc.removeDaemonJson()).not.toThrow();
  });

  it('isDaemonAlive returns false when daemon.json is missing', () => {
    const lc = new DaemonLifecycle({ jsonPath, lockPath });
    expect(lc.isDaemonAlive()).toBe(false);
  });
});
