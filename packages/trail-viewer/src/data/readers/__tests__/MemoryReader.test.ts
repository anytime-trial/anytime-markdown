import { MemoryReader } from '../MemoryReader';

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

describe('MemoryReader.probe', () => {
  it('returns true when server reports exists:true', async () => {
    mockFetch(200, { exists: true });
    const reader = new MemoryReader(BASE);
    expect(await reader.probe()).toBe(true);
  });

  it('returns false when server reports exists:false', async () => {
    mockFetch(200, { exists: false });
    expect(await new MemoryReader(BASE).probe()).toBe(false);
  });

  it('returns false on network error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    expect(await new MemoryReader(BASE).probe()).toBe(false);
  });
});

describe('MemoryReader.listDriftEvents', () => {
  it('returns array from server', async () => {
    const data = [{ id: 'd1', driftType: 'spec_vs_code', severity: 'warn' }];
    mockFetch(200, data);
    const rows = await new MemoryReader(BASE).listDriftEvents({});
    expect(rows).toEqual(data);
  });

  it('sends unresolvedOnly=true query param', async () => {
    const mock = mockFetch(200, []);
    await new MemoryReader(BASE).listDriftEvents({ unresolvedOnly: true });
    const url = (mock.mock.calls[0] as [string])[0];
    expect(url).toContain('unresolvedOnly=true');
  });

  it('sends severity filter', async () => {
    const mock = mockFetch(200, []);
    await new MemoryReader(BASE).listDriftEvents({ severity: 'error' });
    const url = (mock.mock.calls[0] as [string])[0];
    expect(url).toContain('severity=error');
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch(500, null);
    expect(await new MemoryReader(BASE).listDriftEvents({})).toEqual([]);
  });
});

describe('MemoryReader.getDriftEventDetail', () => {
  it('returns detail object', async () => {
    const data = { id: 'd1', detailJson: { key: 'val' } };
    mockFetch(200, data);
    expect(await new MemoryReader(BASE).getDriftEventDetail('d1')).toEqual(data);
  });

  it('returns null on 404', async () => {
    mockFetch(404, null);
    expect(await new MemoryReader(BASE).getDriftEventDetail('no-such')).toBeNull();
  });
});

describe('MemoryReader.resolveDriftEvent', () => {
  it('sends POST with resolutionNote body', async () => {
    const mock = mockFetch(200, { ok: true });
    const result = await new MemoryReader(BASE).resolveDriftEvent('d1', 'fixed');
    expect(result).toEqual({ ok: true });
    const [url, opts] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/memory/drift/events/d1/resolve');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ resolutionNote: 'fixed' });
  });

  it('returns { ok: false } on network error', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('err')) as unknown as typeof fetch;
    expect(await new MemoryReader(BASE).resolveDriftEvent('d1', '')).toEqual({ ok: false });
  });
});

describe('MemoryReader.listRecurringBugs', () => {
  it('sends pkg filter', async () => {
    const mock = mockFetch(200, []);
    await new MemoryReader(BASE).listRecurringBugs({ pkg: 'trail-viewer' });
    expect((mock.mock.calls[0] as [string])[0]).toContain('pkg=trail-viewer');
  });
});

describe('MemoryReader.getBugHistory', () => {
  it('returns array', async () => {
    const data = [{ id: 'bf1', commitSha: 'abc' }];
    mockFetch(200, data);
    expect(await new MemoryReader(BASE).getBugHistory({})).toEqual(data);
  });
});

describe('MemoryReader.listUnaddressedReviewFindings', () => {
  it('sends daysSinceMin filter', async () => {
    const mock = mockFetch(200, []);
    await new MemoryReader(BASE).listUnaddressedReviewFindings({ daysSinceMin: 7 });
    expect((mock.mock.calls[0] as [string])[0]).toContain('daysSinceMin=7');
  });
});

describe('MemoryReader.getReviewHistory', () => {
  it('sends targetFilePath filter', async () => {
    const mock = mockFetch(200, []);
    await new MemoryReader(BASE).getReviewHistory({ targetFilePath: 'src/foo.ts' });
    expect((mock.mock.calls[0] as [string])[0]).toContain('targetFilePath=src%2Ffoo.ts');
  });
});

describe('MemoryReader.listPipelineRuns', () => {
  it('returns pipeline run array', async () => {
    const data = [{ id: 'r1', scope: 'drift', status: 'success' }];
    mockFetch(200, data);
    expect(await new MemoryReader(BASE).listPipelineRuns({})).toEqual(data);
  });
});

describe('MemoryReader.listFailedItems', () => {
  it('sends scope filter', async () => {
    const mock = mockFetch(200, []);
    await new MemoryReader(BASE).listFailedItems({ scope: 'drift' });
    expect((mock.mock.calls[0] as [string])[0]).toContain('scope=drift');
  });
});

describe('MemoryReader.listTopEntities', () => {
  it('returns entity array', async () => {
    const data = [{ id: 'e1', canonicalName: 'trail-viewer' }];
    mockFetch(200, data);
    expect(await new MemoryReader(BASE).listTopEntities({})).toEqual(data);
  });
});

describe('MemoryReader.listInvalidations', () => {
  it('returns invalidation array', async () => {
    const data = [{ id: 'inv1', reason: 'rule_exclusive' }];
    mockFetch(200, data);
    expect(await new MemoryReader(BASE).listInvalidations({})).toEqual(data);
  });
});
