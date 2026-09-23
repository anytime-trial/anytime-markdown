import {
  MODEL_PRICING,
  calculateCost,
  resolvePricingModelName,
  resolveRateModelName,
  isKnownPricingModel,
  isCountableModel,
} from '../pricing';

const M = (inputTokens: number, outputTokens: number, cacheReadTokens = 0, cacheCreationTokens = 0) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
});

describe('pricing', () => {
  describe('MODEL_PRICING', () => {
    it('should have pricing for current and legacy generations', () => {
      expect(MODEL_PRICING).toHaveProperty('opus');
      expect(MODEL_PRICING).toHaveProperty('opus-legacy');
      expect(MODEL_PRICING).toHaveProperty('sonnet');
      expect(MODEL_PRICING).toHaveProperty('haiku');
      expect(MODEL_PRICING).toHaveProperty('haiku-legacy');
      expect(MODEL_PRICING).toHaveProperty('fable');
      expect(MODEL_PRICING).toHaveProperty(['gpt-5.1-codex']);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for current opus generation (4.5+: $5/$25)', () => {
      // 旧テストは 15+75（Opus 4.1 以前の価格）を固定していた。現行世代は 5/25
      expect(calculateCost('opus', M(1_000_000, 1_000_000))).toBeCloseTo(5 + 25, 2);
      expect(calculateCost('claude-opus-4-8', M(1_000_000, 1_000_000))).toBeCloseTo(5 + 25, 2);
      expect(calculateCost('claude-opus-4-5-20251101', M(1_000_000, 1_000_000))).toBeCloseTo(5 + 25, 2);
    });

    it('should calculate legacy price for pre-4.5 opus generations ($15/$75)', () => {
      expect(calculateCost('claude-opus-4-1-20250805', M(1_000_000, 1_000_000))).toBeCloseTo(15 + 75, 2);
      expect(calculateCost('claude-opus-4-20250514', M(1_000_000, 1_000_000))).toBeCloseTo(15 + 75, 2);
      expect(calculateCost('claude-3-opus-20240229', M(1_000_000, 1_000_000))).toBeCloseTo(15 + 75, 2);
    });

    it('should calculate cost for sonnet model', () => {
      expect(calculateCost('sonnet', M(1_000_000, 1_000_000))).toBeCloseTo(3 + 15, 2);
    });

    it('should calculate cost for current haiku generation (4.5: $1/$5)', () => {
      expect(calculateCost('haiku', M(1_000_000, 1_000_000))).toBeCloseTo(1 + 5, 2);
      expect(calculateCost('claude-haiku-4-5-20251001', M(1_000_000, 1_000_000))).toBeCloseTo(1 + 5, 2);
    });

    it('should calculate legacy price for pre-4.5 haiku generations ($0.8/$4)', () => {
      expect(calculateCost('claude-3-5-haiku-20241022', M(1_000_000, 1_000_000))).toBeCloseTo(0.8 + 4, 2);
      expect(calculateCost('claude-3-haiku-20240307', M(1_000_000, 1_000_000))).toBeCloseTo(0.8 + 4, 2);
    });

    it('should calculate cost for fable at its own rates, not the sonnet fallback', () => {
      // 回帰: 料金表にエントリが無く sonnet(3/15) へ暗黙フォールバックしていた（実料金 10/50）
      expect(calculateCost('claude-fable-5', M(1_000_000, 1_000_000))).toBeCloseTo(10 + 50, 2);
      expect(calculateCost('claude-mythos-5', M(1_000_000, 1_000_000))).toBeCloseTo(10 + 50, 2);
    });

    it('should include cache token costs', () => {
      expect(calculateCost('opus', M(0, 0, 1_000_000, 1_000_000))).toBeCloseTo(5 * 0.1 + 5 * 1.25, 2);
    });

    it('should fall back to sonnet pricing for unknown model', () => {
      expect(calculateCost('unknown-model', M(1_000_000, 0))).toBeCloseTo(3, 2);
    });

    it('should normalize model name variants', () => {
      expect(calculateCost('claude-opus-4-6', M(1_000_000, 0))).toBeCloseTo(5, 2);
      expect(calculateCost('claude-sonnet-4-6', M(1_000_000, 0))).toBeCloseTo(3, 2);
      expect(calculateCost('claude-haiku-4-5-20251001', M(1_000_000, 0))).toBeCloseTo(1, 2);
    });

    it('should calculate cost for Codex model names', () => {
      const tokens = M(1_000_000, 1_000_000, 1_000_000, 1_000_000);
      expect(calculateCost('gpt-5.1-codex', tokens)).toBeCloseTo(1.25 + 10 + 0.125 + 1.25, 2);
      expect(calculateCost('gpt-5.2-codex', tokens)).toBeCloseTo(1.75 + 14 + 0.175 + 1.75, 2);
    });

    it('should default empty Codex models to Codex pricing', () => {
      expect(calculateCost('', M(1_000_000, 0), 'codex')).toBeCloseTo(1.25, 2);
    });
  });

  describe('世代で単価が変わるモデル（2026-09 時点の公式単価）', () => {
    it('Opus 5.5 は $4/$20・キャッシュ読取 $0.20 で計算する（Opus 5 の $5/$25 ではない）', () => {
      expect(calculateCost('claude-opus-5-5', M(1_000_000, 1_000_000, 1_000_000, 1_000_000))).toBeCloseTo(4 + 20 + 0.2 + 4 * 1.25, 3);
    });

    it('Fable 5.1 はキャッシュ読取を $0.25 で計算する（Fable 5 は $1.00 のまま）', () => {
      expect(calculateCost('claude-fable-5-1', M(1_000_000, 1_000_000, 1_000_000, 0))).toBeCloseTo(10 + 50 + 0.25, 3);
      expect(calculateCost('claude-fable-5', M(0, 0, 1_000_000, 0))).toBeCloseTo(1, 3);
    });

    it('Sonnet 5 は $2/$10 で計算する（Sonnet 4.6 は $3/$15 のまま）', () => {
      expect(calculateCost('claude-sonnet-5', M(1_000_000, 1_000_000))).toBeCloseTo(2 + 10, 3);
      expect(calculateCost('claude-sonnet-4-6', M(1_000_000, 1_000_000))).toBeCloseTo(3 + 15, 3);
    });

    it('Opus 5 と Opus 4.x は従来の $5/$25 のまま', () => {
      expect(calculateCost('claude-opus-5', M(1_000_000, 1_000_000))).toBeCloseTo(5 + 25, 3);
      expect(calculateCost('claude-opus-4-8', M(1_000_000, 1_000_000))).toBeCloseTo(5 + 25, 3);
    });

    it('Mythos 5.1 はキャッシュ読取単価が未公表のため Fable 5 と同じ単価で計算する', () => {
      expect(calculateCost('claude-mythos-5-1', M(0, 0, 1_000_000, 0))).toBeCloseTo(1, 3);
    });

    it('集計キー（resolvePricingModelName）は family のまま変えない', () => {
      expect(resolvePricingModelName('claude-opus-5-5')).toBe('opus');
      expect(resolvePricingModelName('claude-fable-5-1')).toBe('fable');
      expect(resolvePricingModelName('claude-sonnet-5')).toBe('sonnet');
    });

    it('単価キーは世代を区別する', () => {
      expect(resolveRateModelName('claude-opus-5-5')).toBe('opus-5.5');
      expect(resolveRateModelName('claude-fable-5-1')).toBe('fable-5.1');
      expect(resolveRateModelName('claude-sonnet-5')).toBe('sonnet-5');
      expect(resolveRateModelName('claude-opus-5')).toBe('opus');
      expect(resolveRateModelName('claude-sonnet-4-6')).toBe('sonnet');
      expect(resolveRateModelName('gpt-5.1-codex', 'codex')).toBe('gpt-5.1-codex');
    });
  });

  describe('resolvePricingModelName', () => {
    it('should resolve generations to distinct pricing keys', () => {
      expect(resolvePricingModelName('claude-opus-4-8')).toBe('opus');
      expect(resolvePricingModelName('claude-opus-4-1-20250805')).toBe('opus-legacy');
      expect(resolvePricingModelName('claude-opus-4-20250514')).toBe('opus-legacy');
      expect(resolvePricingModelName('claude-haiku-4-5-20251001')).toBe('haiku');
      expect(resolvePricingModelName('claude-3-5-haiku-20241022')).toBe('haiku-legacy');
      expect(resolvePricingModelName('claude-fable-5')).toBe('fable');
      expect(resolvePricingModelName('claude-mythos-5')).toBe('fable');
      expect(resolvePricingModelName('claude-sonnet-5')).toBe('sonnet');
    });

    it('should keep bare family names on the current generation', () => {
      expect(resolvePricingModelName('opus')).toBe('opus');
      expect(resolvePricingModelName('haiku')).toBe('haiku');
    });
  });

  describe('isKnownPricingModel', () => {
    it('should report known models as known', () => {
      expect(isKnownPricingModel('claude-fable-5')).toBe(true);
      expect(isKnownPricingModel('claude-opus-4-8')).toBe(true);
      expect(isKnownPricingModel('gpt-5.1-codex')).toBe(true);
    });

    it('should report unknown models (silent-fallback detection)', () => {
      expect(isKnownPricingModel('unknown-model')).toBe(false);
      expect(isKnownPricingModel('<synthetic>')).toBe(false);
    });

    it('should report unknown Codex models as unknown (not masked by the codex default fallback)', () => {
      // 回帰: resolve 後のキーで判定すると codex 既定フォールバックにより常に true になる
      expect(isKnownPricingModel('gpt-9-codex-hypothetical')).toBe(false);
    });
  });

  describe('isCountableModel', () => {
    it('should exclude sentinel values like <synthetic>', () => {
      expect(isCountableModel('<synthetic>')).toBe(false);
    });

    it('should keep real model ids and the empty string (existing behavior)', () => {
      expect(isCountableModel('claude-opus-4-8')).toBe(true);
      expect(isCountableModel('')).toBe(true);
    });
  });
});
