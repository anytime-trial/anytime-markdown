// packages/trail-viewer/src/engine/__tests__/pricing.test.ts
import { MODEL_PRICING, calculateCost } from '../pricing';

describe('pricing', () => {
  describe('MODEL_PRICING', () => {
    it('should have pricing for opus, sonnet, haiku', () => {
      expect(MODEL_PRICING).toHaveProperty('opus');
      expect(MODEL_PRICING).toHaveProperty('sonnet');
      expect(MODEL_PRICING).toHaveProperty('haiku');
      expect(MODEL_PRICING).toHaveProperty(['gpt-5.1-codex']);
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
      expect(cost).toBeCloseTo(5 + 25, 2); // Opus 4.5 以降の現行価格
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
      expect(cost).toBeCloseTo(1 + 5, 2); // Haiku 4.5 の現行価格
    });

    it('should include cache token costs', () => {
      const cost = calculateCost('opus', {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
      });
      expect(cost).toBeCloseTo(5 * 0.1 + 5 * 1.25, 2);
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
      expect(calculateCost('claude-opus-4-6', tokens)).toBeCloseTo(5, 2);
      expect(calculateCost('claude-sonnet-4-6', tokens)).toBeCloseTo(3, 2);
      expect(calculateCost('claude-haiku-4-5-20251001', tokens)).toBeCloseTo(1, 2);
      expect(calculateCost('claude-fable-5', tokens)).toBeCloseTo(10, 2); // 回帰: sonnet フォールバック
    });

    it('should calculate cost for Codex model names', () => {
      const tokens = {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
      };
      expect(calculateCost('gpt-5.1-codex', tokens)).toBeCloseTo(1.25 + 10 + 0.125 + 1.25, 2);
      expect(calculateCost('gpt-5.2-codex', tokens)).toBeCloseTo(1.75 + 14 + 0.175 + 1.75, 2);
    });

    it('should default empty Codex models to Codex pricing', () => {
      const cost = calculateCost('', {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }, 'codex');
      expect(cost).toBeCloseTo(1.25, 2);
    });
  });
});
