import { buildActivityTrendUrl, fetchActivityTrendApi } from '../fetchActivityTrendApi';

describe('buildActivityTrendUrl', () => {
  it('builds URL with elementId encoded', () => {
    const url = buildActivityTrendUrl('http://x', {
      elementId: 'pkg_trail-activity/hotspot',
      period: '30d',
      granularity: 'commit',
    });
    expect(url).toContain('elementId=pkg_trail-activity%2Fhotspot');
    expect(url).toContain('period=30d');
    expect(url).toContain('granularity=commit');
  });

  it('adds sessionMode when requested', () => {
    const url = buildActivityTrendUrl('http://x', {
      elementId: 'pkg_x',
      period: '30d',
      granularity: 'session',
      sessionMode: 'read',
    });
    expect(url).toContain('granularity=session');
    expect(url).toContain('sessionMode=read');
  });

  it('allows defect granularity', () => {
    const url = buildActivityTrendUrl('http://x', {
      elementId: 'pkg_x',
      period: '30d',
      granularity: 'defect',
    });
    expect(url).toContain('granularity=defect');
  });
});

describe('fetchActivityTrendApi', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  it('throws on 503', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable' }) as typeof fetch;
    await expect(
      fetchActivityTrendApi('http://x', {
        elementId: 'pkg_x',
        period: '30d',
        granularity: 'commit',
      }),
    ).rejects.toThrow(/503/);
  });
});
