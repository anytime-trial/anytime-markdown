// Mock dependencies that C4DataServer imports but we don't need for type guard tests
jest.mock('@anytime-markdown/c4-kernel', () => ({}));
jest.mock('ws', () => ({ WebSocketServer: jest.fn() }));

import { isClientMessage } from '../C4DataServer';

describe('isClientMessage', () => {
  describe('valid messages', () => {
    it('should accept set-level message', () => {
      expect(isClientMessage({ type: 'set-level', level: 'component' })).toBe(true);
    });

    it('should accept set-level with package level', () => {
      expect(isClientMessage({ type: 'set-level', level: 'package' })).toBe(true);
    });

    it('should accept set-dsm-mode message', () => {
      expect(isClientMessage({ type: 'set-dsm-mode', mode: 'c4' })).toBe(true);
    });

    it('should accept cluster message', () => {
      expect(isClientMessage({ type: 'cluster', enabled: true })).toBe(true);
    });

    it('should accept refresh message', () => {
      expect(isClientMessage({ type: 'refresh' })).toBe(true);
    });
  });

  describe('invalid messages', () => {
    it('should reject unknown type', () => {
      expect(isClientMessage({ type: 'unknown' })).toBe(false);
    });

    it('should reject null', () => {
      expect(isClientMessage(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isClientMessage(undefined)).toBe(false);
    });

    it('should reject string', () => {
      expect(isClientMessage('string')).toBe(false);
    });

    it('should reject number', () => {
      expect(isClientMessage(42)).toBe(false);
    });

    it('should reject empty object', () => {
      expect(isClientMessage({})).toBe(false);
    });

    it('should reject object with non-string type', () => {
      expect(isClientMessage({ type: 123 })).toBe(false);
    });

    it('should reject array', () => {
      expect(isClientMessage([{ type: 'refresh' }])).toBe(false);
    });

    it('should reject object with type as boolean', () => {
      expect(isClientMessage({ type: true })).toBe(false);
    });
  });
});
