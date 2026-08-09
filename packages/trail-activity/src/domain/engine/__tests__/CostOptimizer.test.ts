import {
  classifyByRules,
  classifyByFeatures,
  type CostRulesConfig,
  type MessageFeatures,
} from '../CostOptimizer';

const testRules: CostRulesConfig = {
  rules: [
    { pattern: '^(ok|yes|はい)$', model: 'haiku', label: '確認' },
    { pattern: 'バグ|エラー', model: 'opus', label: 'デバッグ' },
    { pattern: '色|幅', model: 'sonnet', label: 'UI' },
  ],
  default: 'sonnet',
};

describe('CostOptimizer', () => {
  describe('classifyByRules', () => {
    it('should match confirmation pattern -> haiku', () => {
      const result = classifyByRules('ok', testRules);
      expect(result).toEqual({ model: 'haiku', label: '確認' });
    });

    it('should match debug pattern -> opus', () => {
      const result = classifyByRules('バグを修正してください', testRules);
      expect(result).toEqual({ model: 'opus', label: 'デバッグ' });
    });

    it('should match UI pattern -> sonnet', () => {
      const result = classifyByRules('幅を広げてください', testRules);
      expect(result).toEqual({ model: 'sonnet', label: 'UI' });
    });

    it('should return default when no rule matches', () => {
      const result = classifyByRules('ランダムなメッセージ', testRules);
      expect(result).toEqual({ model: 'sonnet', label: undefined });
    });

    it('should match first rule when multiple match', () => {
      const result = classifyByRules('はい', testRules);
      expect(result.model).toBe('haiku');
    });
  });

  describe('classifyByFeatures', () => {
    it('should return haiku for low token, no tool calls', () => {
      const features: MessageFeatures = {
        outputTokens: 200,
        toolCallNames: [],
        uniqueFileCount: 0,
      };
      expect(classifyByFeatures(features).model).toBe('haiku');
    });

    it('should return sonnet for search-only tools', () => {
      const features: MessageFeatures = {
        outputTokens: 1000,
        toolCallNames: ['Grep', 'Read', 'Glob'],
        uniqueFileCount: 0,
      };
      expect(classifyByFeatures(features).model).toBe('sonnet');
    });

    it('should return opus for multi-file edits', () => {
      const features: MessageFeatures = {
        outputTokens: 2000,
        toolCallNames: ['Edit', 'Write', 'Edit'],
        uniqueFileCount: 4,
      };
      expect(classifyByFeatures(features).model).toBe('opus');
    });

    it('should return opus for high token + many tool types', () => {
      const features: MessageFeatures = {
        outputTokens: 4000,
        toolCallNames: ['Read', 'Grep', 'Edit', 'Bash'],
        uniqueFileCount: 1,
      };
      expect(classifyByFeatures(features).model).toBe('opus');
    });

    it('should default to sonnet', () => {
      const features: MessageFeatures = {
        outputTokens: 1000,
        toolCallNames: ['Edit'],
        uniqueFileCount: 1,
      };
      expect(classifyByFeatures(features).model).toBe('sonnet');
    });
  });
});
