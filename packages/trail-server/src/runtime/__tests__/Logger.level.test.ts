/**
 * Additional coverage for Logger.ts — level filter at min boundaries:
 *   line 49: debug() suppressed when level > debug (e.g. warn)
 *   line 58: error() suppressed when level > error — actually error=40 is max, so
 *            the only suppressible path is shouldLog returning false for error.
 *            We verify that setting level='error' suppresses debug/info/warn.
 */
import { ConsoleLogger, FileLogger } from '../Logger';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Logger — level filtering', () => {
  describe('ConsoleLogger level=warn', () => {
    let spy: jest.SpyInstance;
    beforeEach(() => {
      spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });
    afterEach(() => spy.mockRestore());

    it('suppresses debug() when level=warn', () => {
      const logger = new ConsoleLogger('warn');
      logger.debug('should not appear');
      expect(spy).not.toHaveBeenCalled();
    });

    it('suppresses info() when level=warn', () => {
      const logger = new ConsoleLogger('warn');
      logger.info('should not appear');
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits warn() when level=warn', () => {
      const logger = new ConsoleLogger('warn');
      logger.warn('visible');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain('[WARN]');
    });

    it('emits error() when level=warn', () => {
      const logger = new ConsoleLogger('warn');
      logger.error('also visible');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain('[ERROR]');
    });
  });

  describe('ConsoleLogger level=error', () => {
    let spy: jest.SpyInstance;
    beforeEach(() => {
      spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });
    afterEach(() => spy.mockRestore());

    it('suppresses debug/info/warn when level=error', () => {
      const logger = new ConsoleLogger('error');
      logger.debug('x');
      logger.info('x');
      logger.warn('x');
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits error() when level=error', () => {
      const logger = new ConsoleLogger('error');
      logger.error('critical');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('FileLogger level filtering', () => {
    let dir: string;

    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'logger-lvl-')); });
    afterEach(() => rmSync(dir, { recursive: true }));

    it('suppresses debug messages when FileLogger level=info', () => {
      const logPath = join(dir, 'app.log');
      const logger = new FileLogger(logPath, 'info');
      logger.debug('hidden debug');
      logger.info('visible info');
      logger.dispose?.();
      const content = readFileSync(logPath, 'utf8');
      expect(content).not.toContain('hidden debug');
      expect(content).toContain('visible info');
    });
  });
});
