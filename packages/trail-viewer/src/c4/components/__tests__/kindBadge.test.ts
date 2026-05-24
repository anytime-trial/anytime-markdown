import type { TrailI18n } from '../../../i18n/types';
import { kindBadge } from '../kindBadge';

// t スタブ: キー文字列をそのまま返す（キーマッピングの検証用）
const t = (key: keyof TrailI18n): string => key;

describe('kindBadge', () => {
  it('maps known kinds to localized short/full i18n keys', () => {
    expect(kindBadge('function', t)).toEqual({ short: 'c4.kind.function', full: 'c4.kind.function.full' });
    expect(kindBadge('class', t)).toEqual({ short: 'c4.kind.class', full: 'c4.kind.class.full' });
    expect(kindBadge('method', t)).toEqual({ short: 'c4.kind.method', full: 'c4.kind.method.full' });
    expect(kindBadge('variable', t)).toEqual({ short: 'c4.kind.variable', full: 'c4.kind.variable.full' });
  });

  it('falls back to the raw kind for unknown kinds', () => {
    expect(kindBadge('namespace', t)).toEqual({ short: 'namespace', full: 'namespace' });
    expect(kindBadge('', t)).toEqual({ short: '', full: '' });
  });
});
