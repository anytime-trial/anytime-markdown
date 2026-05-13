import { ConsoleLogger, FileLogger, type Logger } from '../Logger';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Logger', () => {
  describe('ConsoleLogger', () => {
    it('writes info to stdout with ISO timestamp prefix', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger: Logger = new ConsoleLogger('info');
      logger.info('hello', { foo: 42 });
      const out = spy.mock.calls[0][0] as string;
      expect(out).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] hello/);
      expect(out).toContain('foo=42');
      spy.mockRestore();
    });

    it('skips debug when level=info', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger: Logger = new ConsoleLogger('info');
      logger.debug('hidden');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('child() prefixes scope', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const root: Logger = new ConsoleLogger('info');
      const child = root.child('scheduler/jsonl-ingest');
      child.info('ok');
      const out = spy.mock.calls[0][0] as string;
      expect(out).toContain('[scheduler/jsonl-ingest]');
      spy.mockRestore();
    });
  });

  describe('FileLogger', () => {
    it('writes to file with same format as ConsoleLogger', () => {
      const dir = mkdtempSync(join(tmpdir(), 'trail-logger-test-'));
      const logPath = join(dir, 'app.log');
      const logger: Logger = new FileLogger(logPath, 'info');
      logger.info('hello world');
      logger.dispose?.();
      const content = readFileSync(logPath, 'utf8');
      expect(content).toMatch(/\[INFO\] hello world/);
      rmSync(dir, { recursive: true });
    });

    it('appends error stack on error()', () => {
      const dir = mkdtempSync(join(tmpdir(), 'trail-logger-test-'));
      const logPath = join(dir, 'app.log');
      const logger: Logger = new FileLogger(logPath, 'info');
      logger.error('boom', new Error('test error'));
      logger.dispose?.();
      const content = readFileSync(logPath, 'utf8');
      expect(content).toContain('boom');
      expect(content).toContain('Error: test error');
      expect(content).toContain('at ');
      rmSync(dir, { recursive: true });
    });
  });
});
