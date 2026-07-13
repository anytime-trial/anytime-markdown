import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ClaudeUsageCache } from '../ClaudeUsageCache';
import type { ClaudeUsageSnapshot } from '../types';

const tempDirs: string[] = [];

async function makeCachePath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-cache-'));
  tempDirs.push(dir);
  return path.join(dir, 'claude-usage.json');
}

const snapshot: ClaudeUsageSnapshot = {
  version: 1,
  rows: [
    {
      key: 'session',
      label: 'Session (5h)',
      percent: 29,
      severity: 'normal',
      resetsAt: '2026-07-12T14:19:59.000Z',
    },
  ],
  fetchedAt: '2026-07-12T13:19:59.000Z',
  backoffUntil: null,
  failureCount: 0,
};

describe('ClaudeUsageCache', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  it('round-trips a usage snapshot', async () => {
    const cache = new ClaudeUsageCache(await makeCachePath());

    await cache.write(snapshot);

    await expect(cache.read()).resolves.toEqual({ kind: 'hit', snapshot });
  });

  it('returns a null snapshot for corrupt JSON with a reason', async () => {
    const cachePath = await makeCachePath();
    await fs.writeFile(cachePath, '{', 'utf-8');

    await expect(new ClaudeUsageCache(cachePath).read()).resolves.toMatchObject({
      kind: 'invalid',
      snapshot: null,
    });
  });

  it('returns a null snapshot for a missing file with a reason', async () => {
    const cachePath = await makeCachePath();
    await fs.rm(cachePath, { force: true });

    await expect(new ClaudeUsageCache(cachePath).read()).resolves.toEqual({
      kind: 'missing',
      snapshot: null,
    });
  });
});
