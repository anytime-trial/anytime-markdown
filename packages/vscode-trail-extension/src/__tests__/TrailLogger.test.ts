import { OutputChannelLogger, TrailLogger } from '../utils/TrailLogger';
import type { Logger } from '@anytime-markdown/trail-server';

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

function makeMockChannel() {
  return {
    appendLine: jest.fn(),
    dispose: jest.fn(),
  };
}

// --------------------------------------------------------------------
// OutputChannelLogger
// --------------------------------------------------------------------

describe('OutputChannelLogger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes info message with timestamp and level label', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info');
    logger.info('hello');
    expect(ch.appendLine).toHaveBeenCalledTimes(1);
    const line = ch.appendLine.mock.calls[0][0] as string;
    expect(line).toMatch(/\[INFO\]/);
    expect(line).toMatch(/hello/);
  });

  it('includes scope in message when provided', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info', 'MyScope');
    logger.info('scoped');
    const line = ch.appendLine.mock.calls[0][0] as string;
    expect(line).toContain('[MyScope]');
  });

  it('does not log debug messages when level is info', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info');
    logger.debug('hidden');
    expect(ch.appendLine).not.toHaveBeenCalled();
  });

  it('logs debug messages when level is debug', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'debug');
    logger.debug('visible');
    expect(ch.appendLine).toHaveBeenCalledTimes(1);
    const line = ch.appendLine.mock.calls[0][0] as string;
    expect(line).toMatch(/\[DEBUG\]/);
  });

  it('logs warn messages', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info');
    logger.warn('oops');
    const line = ch.appendLine.mock.calls[0][0] as string;
    expect(line).toMatch(/\[WARN\]/);
  });

  it('logs error messages and appends stack when Error is provided', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info');
    const err = new Error('boom');
    logger.error('fail', err);
    expect(ch.appendLine).toHaveBeenCalledTimes(2);
    const errLine = ch.appendLine.mock.calls[1][0] as string;
    expect(errLine).toContain('Error: boom');
  });

  it('logs error with non-Error value as string', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info');
    logger.error('fail', 'string-err');
    expect(ch.appendLine).toHaveBeenCalledTimes(2);
    expect(ch.appendLine.mock.calls[1][0]).toBe('string-err');
  });

  it('logs error with no err value — only one line', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info');
    logger.error('fail');
    expect(ch.appendLine).toHaveBeenCalledTimes(1);
  });

  it('appends meta key=value pairs', () => {
    const ch = makeMockChannel();
    const logger = new OutputChannelLogger(ch as never, 'info');
    logger.info('with meta', { key: 'val' });
    const line = ch.appendLine.mock.calls[0][0] as string;
    expect(line).toContain('key="val"');
  });

  it('child() creates nested scope logger', () => {
    const ch = makeMockChannel();
    const parent = new OutputChannelLogger(ch as never, 'info', 'Parent');
    const child = parent.child('Child') as OutputChannelLogger;
    child.info('nested');
    const line = ch.appendLine.mock.calls[0][0] as string;
    expect(line).toContain('[Parent/Child]');
  });

  it('child() from logger without scope sets scope directly', () => {
    const ch = makeMockChannel();
    const parent = new OutputChannelLogger(ch as never, 'info');
    const child = parent.child('Child');
    (child as OutputChannelLogger).info('no parent scope');
    const line = ch.appendLine.mock.calls[0][0] as string;
    expect(line).toContain('[Child]');
  });
});

// --------------------------------------------------------------------
// TrailLogger singleton helpers
// --------------------------------------------------------------------

describe('TrailLogger', () => {
  beforeEach(() => {
    // always start clean
    TrailLogger.dispose();
  });

  afterEach(() => {
    TrailLogger.dispose();
    delete process.env.TRAIL_DEBUG;
    delete process.env.TRAIL_DEBUG_SQL;
    delete process.env.TRAIL_DEBUG_PERF;
  });

  it('init() sets channel and provides asLogger()', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    const logger = TrailLogger.asLogger();
    expect(logger).toBeDefined();
    logger.info('via asLogger');
    expect(ch.appendLine).toHaveBeenCalled();
  });

  it('asLogger() lazy-creates channel when init() not called', () => {
    // window.createOutputChannel is mocked by __mocks__/vscode.ts
    const logger = TrailLogger.asLogger();
    expect(logger).toBeDefined();
  });

  it('info() writes to channel', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.info('hello info');
    expect(ch.appendLine).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    expect(ch.appendLine).toHaveBeenCalledWith(expect.stringContaining('hello info'));
  });

  it('warn() writes to channel', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.warn('warning msg');
    expect(ch.appendLine).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
  });

  it('error() writes with Error detail and stack', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    const err = new Error('fail');
    TrailLogger.error('error msg', err);
    const calls = ch.appendLine.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((l) => l.includes('[ERROR]') && l.includes('fail'))).toBe(true);
    expect(calls.some((l) => l.includes('Error: fail'))).toBe(true);
  });

  it('error() with non-Error value appends string representation', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.error('error msg', 'raw-string');
    const calls = ch.appendLine.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((l) => l.includes(': raw-string'))).toBe(true);
  });

  it('error() with no err writes single line', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.error('no err');
    expect(ch.appendLine).toHaveBeenCalledTimes(1);
  });

  it('debug() is a no-op when TRAIL_DEBUG !== "1"', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.debug('hidden');
    expect(ch.appendLine).not.toHaveBeenCalled();
  });

  it('debug() writes when TRAIL_DEBUG=1', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    process.env.TRAIL_DEBUG = '1';
    TrailLogger.debug('visible');
    expect(ch.appendLine).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
  });

  it('debugSql() is a no-op when TRAIL_DEBUG_SQL !== "1"', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.debugSql({ query: 'SELECT 1' });
    expect(ch.appendLine).not.toHaveBeenCalled();
  });

  it('debugSql() writes when TRAIL_DEBUG_SQL=1', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    process.env.TRAIL_DEBUG_SQL = '1';
    TrailLogger.debugSql({ query: 'SELECT 1' });
    expect(ch.appendLine).toHaveBeenCalledWith(expect.stringContaining('[DEBUG:SQL]'));
  });

  it('debugPerf() is a no-op when TRAIL_DEBUG_PERF !== "1"', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.debugPerf({ ms: 100 });
    expect(ch.appendLine).not.toHaveBeenCalled();
  });

  it('debugPerf() writes when TRAIL_DEBUG_PERF=1', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    process.env.TRAIL_DEBUG_PERF = '1';
    TrailLogger.debugPerf({ ms: 100 });
    expect(ch.appendLine).toHaveBeenCalledWith(expect.stringContaining('[DEBUG:PERF]'));
  });

  it('dispose() clears state so next call recreates channel', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    TrailLogger.dispose();
    expect(ch.dispose).toHaveBeenCalled();
  });

  it('addSink() fans out to sink; removeSink() removes it', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);

    const sinkCalls: string[] = [];
    const sink: Logger = {
      info: (m) => { sinkCalls.push(`info:${m}`); },
      warn: (m) => { sinkCalls.push(`warn:${m}`); },
      error: (m) => { sinkCalls.push(`error:${m}`); },
      debug: (m) => { sinkCalls.push(`debug:${m}`); },
      child: () => sink,
    };

    TrailLogger.addSink(sink);
    TrailLogger.info('to sink');
    expect(sinkCalls).toContain('info:to sink');

    TrailLogger.removeSink(sink);
    sinkCalls.length = 0;
    TrailLogger.info('after remove');
    expect(sinkCalls).toHaveLength(0);
  });

  it('removeSink() is a no-op for unknown sink', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    const sink: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), child: () => sink };
    // should not throw
    expect(() => TrailLogger.removeSink(sink)).not.toThrow();
  });

  it('asLogger() returns combined logger when sinks are present', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    const sinkCalls: string[] = [];
    const sink: Logger = {
      info: (m) => { sinkCalls.push(m); },
      warn: jest.fn(), error: jest.fn(), debug: jest.fn(), child: () => sink,
    };
    TrailLogger.addSink(sink);
    const logger = TrailLogger.asLogger();
    logger.info('combined');
    expect(sinkCalls).toContain('combined');
    // cleanup
    TrailLogger.removeSink(sink);
  });

  it('sink errors are swallowed (best-effort)', () => {
    const ch = makeMockChannel();
    TrailLogger.init(ch as never);
    const badSink: Logger = {
      info: () => { throw new Error('sink exploded'); },
      warn: () => { throw new Error('sink exploded'); },
      error: () => { throw new Error('sink exploded'); },
      debug: () => { throw new Error('sink exploded'); },
      child: () => badSink,
    };
    TrailLogger.addSink(badSink);
    // Should not throw
    expect(() => TrailLogger.info('safe')).not.toThrow();
    expect(() => TrailLogger.warn('safe')).not.toThrow();
    expect(() => TrailLogger.error('safe')).not.toThrow();
    TrailLogger.removeSink(badSink);
  });
});
