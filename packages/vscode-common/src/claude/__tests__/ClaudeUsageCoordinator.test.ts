import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ClaudeUsageCoordinator } from '../ClaudeUsageCoordinator';
import type { ClaudeUsageResult } from '../ClaudeUsageClient';
import type { UsageLimitRow } from '../parseClaudeUsage';

const tempDirs: string[] = [];

async function makeCachePath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-coordinator-'));
  tempDirs.push(dir);
  return path.join(dir, 'claude-usage.json');
}

const row: UsageLimitRow = {
  key: 'session',
  label: 'Session (5h)',
  percent: 29,
  severity: 'normal',
  resetsAt: '2026-07-12T14:19:59.000Z',
};

function clientReturning(...results: ClaudeUsageResult[]): { fetchUsage: jest.Mock<Promise<ClaudeUsageResult>, []> } {
  const fetchUsage = jest.fn<Promise<ClaudeUsageResult>, []>();
  for (const result of results) {
    fetchUsage.mockResolvedValueOnce(result);
  }
  return { fetchUsage };
}

describe('ClaudeUsageCoordinator', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  it('does not fetch within the cache TTL', async () => {
    let now = Date.parse('2026-07-12T13:00:00.000Z');
    const client = clientReturning({ kind: 'ok', rows: [row], unknownKinds: [] });
    const coordinator = new ClaudeUsageCoordinator({
      cachePath: await makeCachePath(),
      client,
      ttlMs: 600_000,
      now: () => now,
    });

    await expect(coordinator.refresh()).resolves.toMatchObject({ kind: 'fresh', rows: [row] });
    now += 60_000;
    await expect(coordinator.refresh()).resolves.toMatchObject({ kind: 'fresh', rows: [row] });

    expect(client.fetchUsage).toHaveBeenCalledTimes(1);
  });

  it('does not fetch while a cached backoff is active', async () => {
    const now = Date.parse('2026-07-12T13:00:00.000Z');
    const client = clientReturning(
      { kind: 'rateLimited' },
      { kind: 'ok', rows: [row], unknownKinds: [] },
    );
    const coordinator = new ClaudeUsageCoordinator({
      cachePath: await makeCachePath(),
      client,
      ttlMs: 0,
      now: () => now,
    });

    await expect(coordinator.refresh()).resolves.toMatchObject({ kind: 'rateLimited', rows: [] });
    await expect(coordinator.refresh()).resolves.toMatchObject({ kind: 'rateLimited', rows: [] });

    expect(client.fetchUsage).toHaveBeenCalledTimes(1);
  });

  it('extends rate-limit backoff from 5 to 60 minutes and caps there', async () => {
    let now = Date.parse('2026-07-12T13:00:00.000Z');
    const client = clientReturning(
      { kind: 'rateLimited' },
      { kind: 'rateLimited' },
      { kind: 'rateLimited' },
      { kind: 'rateLimited' },
      { kind: 'rateLimited' },
      { kind: 'rateLimited' },
    );
    const coordinator = new ClaudeUsageCoordinator({
      cachePath: await makeCachePath(),
      client,
      ttlMs: 0,
      now: () => now,
    });
    const minutes: number[] = [];

    for (let i = 0; i < 6; i += 1) {
      const result = await coordinator.refresh();
      if (result.kind !== 'rateLimited') {
        throw new Error(`Expected rateLimited, got ${result.kind}`);
      }
      minutes.push((Date.parse(result.backoffUntil) - now) / 60_000);
      now = Date.parse(result.backoffUntil);
    }

    expect(minutes).toEqual([5, 10, 20, 40, 60, 60]);
    expect(client.fetchUsage).toHaveBeenCalledTimes(6);
  });

  it('resets backoff and failure count after a successful fetch', async () => {
    let now = Date.parse('2026-07-12T13:00:00.000Z');
    const client = clientReturning(
      { kind: 'rateLimited' },
      { kind: 'ok', rows: [row], unknownKinds: [] },
    );
    const coordinator = new ClaudeUsageCoordinator({
      cachePath: await makeCachePath(),
      client,
      ttlMs: 0,
      now: () => now,
    });

    const limited = await coordinator.refresh();
    if (limited.kind !== 'rateLimited') {
      throw new Error(`Expected rateLimited, got ${limited.kind}`);
    }
    now = Date.parse(limited.backoffUntil);

    await expect(coordinator.refresh()).resolves.toMatchObject({
      kind: 'fresh',
      rows: [row],
      failureCount: 0,
      backoffUntil: null,
    });
  });

  it('returns the previous rows when a refresh is rate limited', async () => {
    let now = Date.parse('2026-07-12T13:00:00.000Z');
    const client = clientReturning(
      { kind: 'ok', rows: [row], unknownKinds: [] },
      { kind: 'rateLimited' },
    );
    const coordinator = new ClaudeUsageCoordinator({
      cachePath: await makeCachePath(),
      client,
      ttlMs: 0,
      now: () => now,
    });

    await coordinator.refresh();
    now += 600_000;

    await expect(coordinator.refresh()).resolves.toMatchObject({
      kind: 'rateLimited',
      rows: [row],
    });
  });
});
