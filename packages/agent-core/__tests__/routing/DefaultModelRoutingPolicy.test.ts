import { DefaultModelRoutingPolicy } from '../../src/routing/DefaultModelRoutingPolicy';

describe('DefaultModelRoutingPolicy', () => {
  it('returns the default route for tasks with no override', () => {
    const p = new DefaultModelRoutingPolicy({
      defaultProviderId: 'ollama',
      defaultModel: 'llama3',
    });
    expect(p.resolve('chat')).toEqual({ providerId: 'ollama', model: 'llama3' });
    expect(p.resolveProviderId('embed')).toBe('ollama');
    expect(p.resolveModel('extract')).toBe('llama3');
  });

  it('returns the override for tasks with an override', () => {
    const p = new DefaultModelRoutingPolicy({
      defaultProviderId: 'ollama',
      defaultModel: 'llama3',
      overrides: {
        embed: { providerId: 'ollama', model: 'nomic-embed-text' },
        review: { providerId: 'claude', model: 'sonnet' },
      },
    });
    expect(p.resolve('embed')).toEqual({
      providerId: 'ollama',
      model: 'nomic-embed-text',
    });
    expect(p.resolve('review')).toEqual({
      providerId: 'claude',
      model: 'sonnet',
    });
    // unmapped → default
    expect(p.resolve('chat').providerId).toBe('ollama');
  });

  it('setOverride installs a new route after construction', () => {
    const p = new DefaultModelRoutingPolicy({
      defaultProviderId: 'ollama',
      defaultModel: 'llama3',
    });
    p.setOverride('extract', { providerId: 'ollama', model: 'qwen' });
    expect(p.resolve('extract').model).toBe('qwen');
  });

  it('clearOverride removes a previously installed override', () => {
    const p = new DefaultModelRoutingPolicy({
      defaultProviderId: 'ollama',
      defaultModel: 'llama3',
      overrides: { review: { providerId: 'claude', model: 'sonnet' } },
    });
    p.clearOverride('review');
    expect(p.resolve('review').providerId).toBe('ollama');
  });
});
