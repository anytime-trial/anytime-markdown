import { join } from 'node:path';

import {
  DEFAULT_LEP_CONFIG,
  mergeLepConfig,
  resolveExcludeRoot,
  validateLepConfigInput,
} from '../LepConfig';

describe('LepConfig workspace.excludeRoot', () => {
  it('defaults to empty string', () => {
    expect(DEFAULT_LEP_CONFIG.workspace.excludeRoot).toBe('');
  });

  it('parses workspace.excludeRoot without warnings', () => {
    const { value, warnings } = validateLepConfigInput(
      { workspace: { excludeRoot: '/anytime-markdown' } },
      'test',
    );
    expect(warnings).toEqual([]);
    expect(value.workspace).toEqual({ excludeRoot: '/anytime-markdown' });
  });

  it('merges excludeRoot over base while keeping docsPath default', () => {
    const merged = mergeLepConfig(DEFAULT_LEP_CONFIG, {
      workspace: { excludeRoot: '/anytime-markdown' },
    });
    expect(merged.workspace).toEqual({
      docsPath: '',
      excludeRoot: '/anytime-markdown',
      configPaths: { commitCategories: '', toolCategories: '', skillCategories: '', metricsThresholds: '' },
    });
  });
});

describe('resolveExcludeRoot', () => {
  function configWith(excludeRoot: string) {
    return mergeLepConfig(DEFAULT_LEP_CONFIG, { workspace: { excludeRoot } });
  }

  it('returns undefined when excludeRoot is empty (fall back to repo root)', () => {
    expect(resolveExcludeRoot(configWith(''), '/ws')).toBeUndefined();
    expect(resolveExcludeRoot(configWith('   '), '/ws')).toBeUndefined();
  });

  it('returns an absolute excludeRoot as-is', () => {
    expect(resolveExcludeRoot(configWith('/anytime-markdown'), '/ws')).toBe('/anytime-markdown');
  });

  it('resolves a relative excludeRoot against workspaceRoot', () => {
    expect(resolveExcludeRoot(configWith('sub/dir'), '/ws')).toBe(join('/ws', 'sub/dir'));
  });

  it('returns the relative value as-is when no workspaceRoot is given', () => {
    expect(resolveExcludeRoot(configWith('sub/dir'), undefined)).toBe('sub/dir');
  });
});
