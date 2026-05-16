import { DaemonSinkLogger } from '../DaemonSinkLogger';

describe('DaemonSinkLogger', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('flushes batched logs after debounce', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const sink = new DaemonSinkLogger({ baseUrl: 'http://localhost:1234', fetcher });
    sink.info('a');
    sink.info('b');
    expect(fetcher).not.toHaveBeenCalled();
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0].level).toBe('info');
    expect(body.logs[0].component).toBe('TrailLogger');
  });

  it('flushes immediately on error level', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const sink = new DaemonSinkLogger({ baseUrl: 'http://localhost:1234', fetcher });
    sink.error('boom', new Error('x'));
    // microtask flush
    await Promise.resolve();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.logs[0].level).toBe('error');
    expect(body.logs[0].stack).toContain('Error: x');
  });

  it('flushes when buffer reaches batchSize entries', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const sink = new DaemonSinkLogger({ baseUrl: 'http://localhost:1234', fetcher, batchSize: 50 });
    for (let i = 0; i < 50; i++) sink.info(`m${i}`);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('drops oldest entries when buffer exceeds ringMax (network down)', () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('offline'));
    const sink = new DaemonSinkLogger({
      baseUrl: 'http://localhost:1234',
      fetcher,
      ringMax: 256,
      retryDelaysMs: [],
    });
    for (let i = 0; i < 300; i++) sink.debug(`m${i}`);
    expect(sink.bufferSize()).toBeLessThanOrEqual(256);
  });

  it('respects minLevel filter', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const sink = new DaemonSinkLogger({ baseUrl: 'http://localhost:1234', fetcher, minLevel: 'warn' });
    sink.debug('d');
    sink.info('i');
    sink.warn('w');
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].level).toBe('warn');
  });

  it('child concatenates component with dot separator', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const sink = new DaemonSinkLogger({ baseUrl: 'http://localhost:1234', fetcher, component: 'Root' });
    const child = sink.child('Sub');
    child.info('m');
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.logs[0].component).toBe('Root.Sub');
  });
});
