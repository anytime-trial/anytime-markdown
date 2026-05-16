import { BetterSqlite3MemoryDb } from '@anytime-markdown/memory-core';
import { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } from '@anytime-markdown/trail-core/domain/schema';
import { LogService } from '../LogService';
import { LogSink, combineLoggers } from '../LogSink';
import type { Logger } from '../../runtime/Logger';

function makeService(): LogService {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run(CREATE_EXTENSION_LOGS);
  for (const idx of CREATE_EXTENSION_LOGS_INDEXES) db.run(idx);
  const broadcaster = { notifyLog: jest.fn() };
  return new LogService(db, broadcaster);
}

describe('LogSink', () => {
  it('persists info/warn/error logs to extension_logs', () => {
    const svc = makeService();
    const insertSpy = jest.spyOn(svc, 'insertBatch');
    const sink = new LogSink({ service: svc, scope: 'TestScope' });

    sink.info('hello', { x: 1 });
    sink.warn('careful');
    sink.error('boom', new Error('e1'));

    expect(insertSpy).toHaveBeenCalledTimes(3);
    const [logs1, src1] = insertSpy.mock.calls[0];
    expect(src1).toBe('daemon');
    expect(logs1).toHaveLength(1);
    expect(logs1[0].level).toBe('info');
    expect(logs1[0].component).toBe('TestScope');
    expect(logs1[0].metadata).toEqual({ x: 1 });

    const [logs3] = insertSpy.mock.calls[2];
    expect(logs3[0].level).toBe('error');
    expect(logs3[0].stack).toContain('Error: e1');
  });

  it('filters logs below minLevel', () => {
    const svc = makeService();
    const insertSpy = jest.spyOn(svc, 'insertBatch');
    const sink = new LogSink({ service: svc, scope: 'X', minLevel: 'warn' });

    sink.debug('d');
    sink.info('i');
    sink.warn('w');
    sink.error('e');

    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(insertSpy.mock.calls[0][0][0].level).toBe('warn');
    expect(insertSpy.mock.calls[1][0][0].level).toBe('error');
  });

  it('child scope concatenates with dot', () => {
    const svc = makeService();
    const insertSpy = jest.spyOn(svc, 'insertBatch');
    const sink = new LogSink({ service: svc, scope: 'Root' });
    sink.child('Sub').info('m');
    expect(insertSpy.mock.calls[0][0][0].component).toBe('Root.Sub');
  });

  it('swallows insertBatch errors (best-effort)', () => {
    const svc = makeService();
    jest.spyOn(svc, 'insertBatch').mockImplementation(() => {
      throw new Error('db down');
    });
    const sink = new LogSink({ service: svc, scope: 'X' });
    expect(() => sink.info('m')).not.toThrow();
  });
});

describe('combineLoggers', () => {
  function makeMockLogger(): Logger & { calls: string[] } {
    const calls: string[] = [];
    const l: Logger & { calls: string[] } = {
      calls,
      debug: (msg) => calls.push(`debug:${msg}`),
      info: (msg) => calls.push(`info:${msg}`),
      warn: (msg) => calls.push(`warn:${msg}`),
      error: (msg) => calls.push(`error:${msg}`),
      child: () => l,
    };
    return l;
  }

  it('fans out to primary and others', () => {
    const a = makeMockLogger();
    const b = makeMockLogger();
    const c = makeMockLogger();
    const combined = combineLoggers(a, b, c);
    combined.info('hi');
    combined.error('oops');
    expect(a.calls).toEqual(['info:hi', 'error:oops']);
    expect(b.calls).toEqual(['info:hi', 'error:oops']);
    expect(c.calls).toEqual(['info:hi', 'error:oops']);
  });

  it('continues fan-out when others throw', () => {
    const a = makeMockLogger();
    const b: Logger = {
      debug: () => { throw new Error('b-down'); },
      info: () => { throw new Error('b-down'); },
      warn: () => { throw new Error('b-down'); },
      error: () => { throw new Error('b-down'); },
      child: () => b,
    };
    const c = makeMockLogger();
    const combined = combineLoggers(a, b, c);
    combined.info('hi');
    expect(a.calls).toEqual(['info:hi']);
    expect(c.calls).toEqual(['info:hi']);
  });

  it('propagates primary errors', () => {
    const a: Logger = {
      debug: () => { throw new Error('a-down'); },
      info: () => { throw new Error('a-down'); },
      warn: () => { throw new Error('a-down'); },
      error: () => { throw new Error('a-down'); },
      child: () => a,
    };
    const b = makeMockLogger();
    const combined = combineLoggers(a, b);
    expect(() => combined.info('hi')).toThrow('a-down');
  });

  it('child wraps recursively', () => {
    const a = makeMockLogger();
    const b = makeMockLogger();
    const combined = combineLoggers(a, b);
    const child = combined.child('Sub');
    child.info('m');
    expect(a.calls).toEqual(['info:m']);
    expect(b.calls).toEqual(['info:m']);
  });
});
