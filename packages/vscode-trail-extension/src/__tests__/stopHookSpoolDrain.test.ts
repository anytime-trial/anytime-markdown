import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendStopHookSpool,
  drainStopHookSpool,
  stopHookSpoolPath,
} from '@anytime-markdown/agent-core';
import type { StopHookSpoolEvent } from '@anytime-markdown/agent-core';
import { drainStopHookSpoolOnce } from '../emergency/stopHookSpoolDrain';

function flightReview(sessionId: string, endedAt = '2026-08-02T10:00:00.000Z'): StopHookSpoolEvent {
  return {
    kind: 'flight_review',
    payload: { sessionId, transcriptPath: '/tmp/t.jsonl', cwd: '/ws', endedAt },
  };
}

function safePoint(label: string): StopHookSpoolEvent {
  return {
    kind: 'safe_point',
    payload: {
      createdAt: '2026-08-02T10:00:00.000Z',
      commitHash: 'a'.repeat(40),
      branch: 'develop',
      worktree: '/ws',
      label,
      source: 'stop_hook',
      sessionId: 'session-1',
    },
  };
}

describe('stopHookSpoolDrain', () => {
  let repo: string;
  let airspaceDir: string;
  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'stop-hook-drain-repo-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    airspaceDir = join(repo, '.git', 'anytime');
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(repo, { recursive: true, force: true });
  });

  it('posts drained events to the endpoint matching their kind and empties the spool', async () => {
    appendStopHookSpool(airspaceDir, flightReview('sess-1'));
    appendStopHookSpool(airspaceDir, safePoint('sp'));
    fetchMock.mockResolvedValue({ ok: true });

    const ingested = await drainStopHookSpoolOnce({
      getWorkspacePath: () => repo,
      getPort: () => 19841,
    });

    expect(ingested).toBe(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual([
      'http://127.0.0.1:19841/api/trail/flight-reviews',
      'http://127.0.0.1:19841/api/trail/safe-points',
    ]);
    // body は payload そのもの（既存 API の期待形。kind の封筒は剥がす）
    const [, frInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(frInit.body as string)).toMatchObject({
      sessionId: 'sess-1',
      endedAt: '2026-08-02T10:00:00.000Z',
    });
    const [, spInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(spInit.body as string)).toMatchObject({
      commitHash: 'a'.repeat(40),
      source: 'stop_hook',
    });
    expect(existsSync(stopHookSpoolPath(airspaceDir))).toBe(false);
  });

  it('consolidates flight_review events per session before posting (Stop fires every turn)', async () => {
    appendStopHookSpool(airspaceDir, flightReview('sess-1', '2026-08-02T10:00:00.000Z'));
    appendStopHookSpool(airspaceDir, flightReview('sess-1', '2026-08-02T10:05:00.000Z'));
    appendStopHookSpool(airspaceDir, flightReview('sess-2', '2026-08-02T10:01:00.000Z'));
    fetchMock.mockResolvedValue({ ok: true });

    const ingested = await drainStopHookSpoolOnce({
      getWorkspacePath: () => repo,
      getPort: () => 19841,
    });

    expect(ingested).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string) as { sessionId: string; endedAt: string },
    );
    expect(bodies.find((b) => b.sessionId === 'sess-1')?.endedAt).toBe('2026-08-02T10:05:00.000Z');
  });

  it('re-appends failed events for retry on the next cycle', async () => {
    appendStopHookSpool(airspaceDir, flightReview('sess-ok'));
    appendStopHookSpool(airspaceDir, safePoint('fails'));
    fetchMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });

    const ingested = await drainStopHookSpoolOnce({
      getWorkspacePath: () => repo,
      getPort: () => 19841,
    });

    expect(ingested).toBe(1);
    const remaining = drainStopHookSpool(stopHookSpoolPath(airspaceDir));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.kind).toBe('safe_point');
  });

  it('re-appends when fetch rejects (daemon down)', async () => {
    appendStopHookSpool(airspaceDir, flightReview('sess-down'));
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const ingested = await drainStopHookSpoolOnce({
      getWorkspacePath: () => repo,
      getPort: () => 19841,
    });

    expect(ingested).toBe(0);
    const remaining = drainStopHookSpool(stopHookSpoolPath(airspaceDir));
    expect(remaining.map((e) => e.kind)).toEqual(['flight_review']);
  });

  it('is a no-op outside a git repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'stop-hook-drain-plain-'));
    try {
      const ingested = await drainStopHookSpoolOnce({
        getWorkspacePath: () => plain,
        getPort: () => 19841,
      });
      expect(ingested).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('is a no-op when the spool is empty (no fetch)', async () => {
    const ingested = await drainStopHookSpoolOnce({
      getWorkspacePath: () => repo,
      getPort: () => 19841,
    });
    expect(ingested).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
