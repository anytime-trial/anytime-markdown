import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendEmergencySpool,
  drainEmergencySpool,
  emergencySpoolPath,
} from '@anytime-markdown/agent-core';
import type { EmergencySpoolEvent } from '@anytime-markdown/agent-core';
import { drainOnce } from '../emergency/emergencySpoolDrain';

function event(reason: string): EmergencySpoolEvent {
  return {
    occurredAt: '2026-07-16T10:00:00.000Z',
    event: 'anomaly_detected',
    reason,
    actor: 'agent',
    sessionId: 'session-1',
    detailJson: '{"kind":"loop_detected"}',
  };
}

describe('emergencySpoolDrain', () => {
  let repo: string;
  let airspaceDir: string;
  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'spool-drain-repo-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    airspaceDir = join(repo, '.git', 'anytime');
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(repo, { recursive: true, force: true });
  });

  it('posts drained events to /api/trail/emergency-log and empties the spool', async () => {
    appendEmergencySpool(airspaceDir, event('first'));
    appendEmergencySpool(airspaceDir, { ...event('second'), event: 'kill_switch_on' });
    fetchMock.mockResolvedValue({ ok: true });

    const ingested = await drainOnce({ getWorkspacePath: () => repo, getPort: () => 19841 });

    expect(ingested).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:19841/api/trail/emergency-log');
    expect(JSON.parse(init.body as string)).toMatchObject({
      event: 'anomaly_detected',
      reason: 'first',
      actor: 'agent',
    });
    expect(existsSync(emergencySpoolPath(airspaceDir))).toBe(false);
  });

  it('re-appends failed events for retry on the next cycle', async () => {
    appendEmergencySpool(airspaceDir, event('ok'));
    appendEmergencySpool(airspaceDir, event('fails'));
    fetchMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });

    const ingested = await drainOnce({ getWorkspacePath: () => repo, getPort: () => 19841 });

    expect(ingested).toBe(1);
    const remaining = drainEmergencySpool(emergencySpoolPath(airspaceDir));
    expect(remaining.map((e) => e.reason)).toEqual(['fails']);
  });

  it('re-appends when fetch rejects (daemon down)', async () => {
    appendEmergencySpool(airspaceDir, event('down'));
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const ingested = await drainOnce({ getWorkspacePath: () => repo, getPort: () => 19841 });

    expect(ingested).toBe(0);
    const remaining = drainEmergencySpool(emergencySpoolPath(airspaceDir));
    expect(remaining.map((e) => e.reason)).toEqual(['down']);
  });

  it('is a no-op outside a git repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'spool-drain-plain-'));
    try {
      const ingested = await drainOnce({ getWorkspacePath: () => plain, getPort: () => 19841 });
      expect(ingested).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('is a no-op when no workspace is open', async () => {
    const ingested = await drainOnce({ getWorkspacePath: () => undefined, getPort: () => 19841 });
    expect(ingested).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the spool is empty (no fetch)', async () => {
    const ingested = await drainOnce({ getWorkspacePath: () => repo, getPort: () => 19841 });
    expect(ingested).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
