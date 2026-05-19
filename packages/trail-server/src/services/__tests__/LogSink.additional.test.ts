/**
 * Additional coverage for combineLoggers warn/debug/dispose and LogSink.debug.
 * Complements the existing LogSink.test.ts.
 */
import { combineLoggers, LogSink } from '../LogSink';
import type { Logger } from '../../runtime/Logger';

function makeMockLogger(): Logger & { calls: string[] } {
  const calls: string[] = [];
  let disposed = false;
  const l: Logger & { calls: string[]; disposed: boolean } = {
    calls,
    get disposed() { return disposed; },
    debug: (msg) => calls.push(`debug:${msg}`),
    info: (msg) => calls.push(`info:${msg}`),
    warn: (msg) => calls.push(`warn:${msg}`),
    error: (msg) => calls.push(`error:${msg}`),
    child: () => l,
    dispose: () => { disposed = true; },
  };
  return l;
}

describe('combineLoggers — additional coverage', () => {
  it('fans out warn to primary and others', () => {
    const a = makeMockLogger();
    const b = makeMockLogger();
    const combined = combineLoggers(a, b);
    combined.warn('careful');
    expect(a.calls).toEqual(['warn:careful']);
    expect(b.calls).toEqual(['warn:careful']);
  });

  it('fans out debug to primary and others', () => {
    const a = makeMockLogger();
    const b = makeMockLogger();
    const combined = combineLoggers(a, b);
    combined.debug('tracing');
    expect(a.calls).toEqual(['debug:tracing']);
    expect(b.calls).toEqual(['debug:tracing']);
  });

  it('dispose calls dispose on primary and others', () => {
    let aDisposed = false;
    let bDisposed = false;
    const a = { ...makeMockLogger(), dispose: () => { aDisposed = true; } };
    const b = { ...makeMockLogger(), dispose: () => { bDisposed = true; } };
    const combined = combineLoggers(a, b);
    combined.dispose?.();
    expect(aDisposed).toBe(true);
    expect(bDisposed).toBe(true);
  });

  it('dispose continues even when primary.dispose throws', () => {
    let bDisposed = false;
    const primary: Logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: () => primary,
      dispose: () => { throw new Error('primary-dispose-err'); },
    };
    const b = { ...makeMockLogger(), dispose: () => { bDisposed = true; } };
    const combined = combineLoggers(primary, b);
    expect(() => combined.dispose?.()).not.toThrow();
    expect(bDisposed).toBe(true);
  });

  it('dispose is tolerant when others.dispose throws', () => {
    let aDisposed = false;
    const a = { ...makeMockLogger(), dispose: () => { aDisposed = true; } };
    const other: Logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: () => other,
      dispose: () => { throw new Error('other-dispose-err'); },
    };
    const combined = combineLoggers(a, other);
    expect(() => combined.dispose?.()).not.toThrow();
    expect(aDisposed).toBe(true);
  });

  it('works when primary has no dispose method', () => {
    const primary: Logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: () => primary,
      // no dispose
    };
    const b = makeMockLogger();
    const combined = combineLoggers(primary, b);
    expect(() => combined.dispose?.()).not.toThrow();
  });
});

describe('LogSink.debug', () => {
  it('persists debug logs when minLevel is debug (default)', () => {
    const service = {
      insertBatch: jest.fn(),
    };
    const sink = new LogSink({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service: service as any,
      scope: 'TestScope',
      minLevel: 'debug',
    });
    sink.debug('debug message', { key: 'val' });
    expect(service.insertBatch).toHaveBeenCalledTimes(1);
    const [logs, source] = service.insertBatch.mock.calls[0] as [{ level: string; metadata: unknown }[], string];
    expect(logs[0].level).toBe('debug');
    expect(logs[0].metadata).toEqual({ key: 'val' });
    expect(source).toBe('daemon');
  });

  it('does not persist debug logs when minLevel is info', () => {
    const service = { insertBatch: jest.fn() };
    const sink = new LogSink({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service: service as any,
      scope: 'X',
      minLevel: 'info',
    });
    sink.debug('should be filtered');
    expect(service.insertBatch).not.toHaveBeenCalled();
  });
});
