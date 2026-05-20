/**
 * Additional coverage for Logger.ts:
 * - ConsoleLogger.warn (line 55)
 * - BaseLogger.error with non-Error value (line 61)
 * - FileLogger.child (lines 95-98)
 */
import { ConsoleLogger, FileLogger, type Logger } from '../Logger';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Logger — additional coverage', () => {
  describe('ConsoleLogger', () => {
    it('warn() writes WARN line to stdout', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger: Logger = new ConsoleLogger('debug');
      logger.warn('something risky');
      expect(spy).toHaveBeenCalledTimes(1);
      const out = spy.mock.calls[0][0] as string;
      expect(out).toContain('[WARN]');
      expect(out).toContain('something risky');
      spy.mockRestore();
    });

    it('error() with non-Error value appends stringified value', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger: Logger = new ConsoleLogger('debug');
      logger.error('bad thing', 'raw error string');
      const out = spy.mock.calls[0][0] as string;
      expect(out).toContain('[ERROR]');
      expect(out).toContain('bad thing');
      expect(out).toContain('raw error string');
      spy.mockRestore();
    });

    it('error() with numeric non-Error value appends stringified number', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger: Logger = new ConsoleLogger('debug');
      logger.error('numeric error', 42);
      const out = spy.mock.calls[0][0] as string;
      expect(out).toContain('42');
      spy.mockRestore();
    });

    it('error() with undefined err emits only message', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger: Logger = new ConsoleLogger('debug');
      logger.error('just a message');
      const out = spy.mock.calls[0][0] as string;
      expect(out).toContain('[ERROR]');
      expect(out).toContain('just a message');
      spy.mockRestore();
    });

    it('child() on child() creates nested scope', () => {
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const root: Logger = new ConsoleLogger('info');
      const child1 = root.child('a');
      const child2 = child1.child('b');
      child2.info('nested');
      const out = spy.mock.calls[0][0] as string;
      expect(out).toContain('[a/b]');
      spy.mockRestore();
    });
  });

  describe('FileLogger', () => {
    it('child() shares same fd and writes to same file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'trail-logger-child-'));
      const logPath = join(dir, 'app.log');
      try {
        const logger: Logger = new FileLogger(logPath, 'info');
        const child = logger.child('SubScope');
        child.info('from child');
        logger.dispose?.();
        const content = readFileSync(logPath, 'utf8');
        expect(content).toContain('[SubScope]');
        expect(content).toContain('from child');
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it('child() with existing scope creates nested scope', () => {
      const dir = mkdtempSync(join(tmpdir(), 'trail-logger-nested-'));
      const logPath = join(dir, 'app.log');
      try {
        const logger: Logger = new FileLogger(logPath, 'debug', 'Root');
        const child = logger.child('Sub');
        child.info('msg');
        logger.dispose?.();
        const content = readFileSync(logPath, 'utf8');
        expect(content).toContain('[Root/Sub]');
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it('error() with non-Error appends string to file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'trail-logger-nonErr-'));
      const logPath = join(dir, 'app.log');
      try {
        const logger: Logger = new FileLogger(logPath, 'debug');
        logger.error('crash', { code: 42 });
        logger.dispose?.();
        const content = readFileSync(logPath, 'utf8');
        expect(content).toContain('[ERROR]');
        expect(content).toContain('[object Object]');
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it('warn() writes to file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'trail-logger-warn-'));
      const logPath = join(dir, 'app.log');
      try {
        const logger: Logger = new FileLogger(logPath, 'debug');
        logger.warn('watch out');
        logger.dispose?.();
        const content = readFileSync(logPath, 'utf8');
        expect(content).toContain('[WARN]');
        expect(content).toContain('watch out');
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });
});
