// packages/trail-viewer/src/engine/__tests__/pricing.test.ts
import { MODEL_PRICING, calculateCost } from '../pricing';

describe('pricing', () => {
  describe('MODEL_PRICING', () => {
    it('should have pricing for opus, sonnet, haiku', () => {
      expect(MODEL_PRICING).toHaveProperty('opus');
      expect(MODEL_PRICING).toHaveProperty('sonnet');
      expect(MODEL_PRICING).toHaveProperty('haiku');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for opus model', () => {
      const cost = calculateCost('opus', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      expect(cost).toBeCloseTo(15 + 75, 2);
    });

    it('should calculate cost for sonnet model', () => {
      const cost = calculateCost('sonnet', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      expect(cost).toBeCloseTo(3 + 15, 2);
    });

    it('should calculate cost for haiku model', () => {
      const cost = calculateCost('haiku', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      expect(cost).toBeCloseTo(0.8 + 4, 2);
    });

    it('should include cache token costs', () => {
      const cost = calculateCost('opus', {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
      });
      expect(cost).toBeCloseTo(15 * 0.1 + 15 * 1.25, 2);
    });

    it('should fall back to sonnet pricing for unknown model', () => {
      const cost = calculateCost('unknown-model', {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      expect(cost).toBeCloseTo(3, 2);
    });

    it('should normalize model name variants', () => {
      const tokens = {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      };
      expect(calculateCost('claude-opus-4-6', tokens)).toBeCloseTo(15, 2);
      expect(calculateCost('claude-sonnet-4-6', tokens)).toBeCloseTo(3, 2);
      expect(calculateCost('claude-haiku-4-5-20251001', tokens)).toBeCloseTo(0.8, 2);
    });
  });
});
