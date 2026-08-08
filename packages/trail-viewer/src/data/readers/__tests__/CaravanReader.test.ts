import { CaravanReader } from '../CaravanReader';

const BASE = 'http://127.0.0.1:9999';

function mockFetch(status: number, body: unknown): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CaravanReader.probe', () => {
  it('returns true when server reports exists:true', async () => {
    mockFetch(200, { exists: true });
    const reader = new CaravanReader(BASE);
    expect(await reader.probe()).toBe(true);
  });

  it('returns false when server reports exists:false', async () => {
    mockFetch(200, { exists: false });
    expect(await new CaravanReader(BASE).probe()).toBe(false);
  });

  it('returns false on network error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    expect(await new CaravanReader(BASE).probe()).toBe(false);
  });
});

describe('CaravanReader.listDriftEvents', () => {
  it('returns array from server', async () => {
    const data = [{ id: 'd1', driftType: 'spec_vs_code', severity: 'warn' }];
    mockFetch(200, data);
    const rows = await new CaravanReader(BASE).listDriftEvents({});
    expect(rows).toEqual(data);
  });

  it('sends unresolvedOnly=true query param', async () => {
    const mock = mockFetch(200, []);
    await new CaravanReader(BASE).listDriftEvents({ unresolvedOnly: true });
    const url = (mock.mock.calls[0] as [string])[0];
    expect(url).toContain('unresolvedOnly=true');
  });

  it('sends severity filter', async () => {
    const mock = mockFetch(200, []);
    await new CaravanReader(BASE).listDriftEvents({ severity: 'error' });
    const url = (mock.mock.calls[0] as [string])[0];
    expect(url).toContain('severity=error');
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch(500, null);
    expect(await new CaravanReader(BASE).listDriftEvents({})).toEqual([]);
  });
});

describe('CaravanReader.getDriftEventDetail', () => {
  it('returns detail object', async () => {
    const data = { id: 'd1', detailJson: { key: 'val' } };
    mockFetch(200, data);
    expect(await new CaravanReader(BASE).getDriftEventDetail('d1')).toEqual(data);
  });

  it('returns null on 404', async () => {
    mockFetch(404, null);
    expect(await new CaravanReader(BASE).getDriftEventDetail('no-such')).toBeNull();
  });
});

describe('CaravanReader.resolveDriftEvent', () => {
  it('sends POST with resolutionNote body', async () => {
    const mock = mockFetch(200, { ok: true });
    const result = await new CaravanReader(BASE).resolveDriftEvent('d1', 'fixed');
    expect(result).toEqual({ ok: true });
    const [url, opts] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/caravan/drift/events/d1/resolve');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ resolutionNote: 'fixed' });
  });

  it('returns { ok: false } on network error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('err')) as unknown as typeof fetch;
    expect(await new CaravanReader(BASE).resolveDriftEvent('d1', '')).toEqual({ ok: false });
  });
});

describe('CaravanReader.listRecurringBugs', () => {
  it('sends pkg filter', async () => {
    const mock = mockFetch(200, []);
    await new CaravanReader(BASE).listRecurringBugs({ pkg: 'trail-viewer' });
    expect((mock.mock.calls[0] as [string])[0]).toContain('pkg=trail-viewer');
  });
});

describe('CaravanReader.getBugHistory', () => {
  it('returns array', async () => {
    const data = [{ id: 'bf1', commitSha: 'abc' }];
    mockFetch(200, data);
    expect(await new CaravanReader(BASE).getBugHistory({})).toEqual(data);
  });
});

describe('CaravanReader.listUnaddressedReviewFindings', () => {
  it('sends daysSinceMin filter', async () => {
    const mock = mockFetch(200, []);
    await new CaravanReader(BASE).listUnaddressedReviewFindings({ daysSinceMin: 7 });
    expect((mock.mock.calls[0] as [string])[0]).toContain('daysSinceMin=7');
  });
});

describe('CaravanReader.getReviewHistory', () => {
  it('sends targetFilePath filter', async () => {
    const mock = mockFetch(200, []);
    await new CaravanReader(BASE).getReviewHistory({ targetFilePath: 'src/foo.ts' });
    expect((mock.mock.calls[0] as [string])[0]).toContain('targetFilePath=src%2Ffoo.ts');
  });
});

describe('CaravanReader.listPipelineRunStatsByDay', () => {
  it('returns aggregated stats array and targets /by-day endpoint', async () => {
    const data = [{ day: '2026-05-16', scope: 'drift', wave: 'memory', runs: 3, durationSec: 120, itemsProcessed: 10, worstStatus: 'success' }];
    const mock = mockFetch(200, data);
    expect(await new CaravanReader(BASE).listPipelineRunStatsByDay({ since: '2026-04-16T00:00:00.000Z' })).toEqual(data);
    expect((mock.mock.calls[0] as [string])[0]).toContain('/api/caravan/pipeline/runs/by-day');
    expect((mock.mock.calls[0] as [string])[0]).toContain('since=');
  });
});

describe('CaravanReader.listPipelineRuns', () => {
  it('returns runs and sends filters', async () => {
    const data = [{ id: 'run-1', wave: 'memory', status: 'error' }];
    const mock = mockFetch(200, data);
    expect(await new CaravanReader(BASE).listPipelineRuns({
      since: '2026-04-16T00:00:00.000Z',
      wave: 'memory',
      status: 'error',
      limit: 10,
    })).toEqual(data);
    const url = (mock.mock.calls[0] as [string])[0];
    expect(url).toContain('/api/caravan/pipeline/runs?');
    expect(url).toContain('since=');
    expect(url).toContain('wave=memory');
    expect(url).toContain('status=error');
    expect(url).toContain('limit=10');
  });
});

describe('CaravanReader.listPipelineRunLogs', () => {
  it('returns logs and encodes run id', async () => {
    const data = [{ id: 1, message: 'started', metadata: '{"step":1}' }];
    const mock = mockFetch(200, data);
    expect(await new CaravanReader(BASE).listPipelineRunLogs({ runId: 'run/1', limit: 20 })).toEqual(data);
    const url = (mock.mock.calls[0] as [string])[0];
    expect(url).toContain('/api/caravan/pipeline/runs/run%2F1/logs?');
    expect(url).toContain('limit=20');
  });
});

describe('CaravanReader.listFailedItems', () => {
  it('sends scope filter', async () => {
    const mock = mockFetch(200, []);
    await new CaravanReader(BASE).listFailedItems({ scope: 'drift' });
    expect((mock.mock.calls[0] as [string])[0]).toContain('scope=drift');
  });
});

describe('CaravanReader.listInvalidations', () => {
  it('returns invalidation array', async () => {
    const data = [{ id: 'inv1', reason: 'rule_exclusive' }];
    mockFetch(200, data);
    expect(await new CaravanReader(BASE).listInvalidations({})).toEqual(data);
  });
});
