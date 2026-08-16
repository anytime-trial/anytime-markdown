import {
  canonicalVersion,
  entryId,
  normalizeImpact,
  normalizeReleases,
  parseVersionRange,
  summarizeByMonth,
  versionSortKey,
} from '../lib/releaseTimeline/normalize';
import type { RawRelease } from '../lib/releaseTimeline/types';

function raw(overrides: Partial<RawRelease> = {}): RawRelease {
  return {
    version: '2.1.100',
    kind: 'cli',
    date: '2026-04-01',
    dateConfidence: 'explicit',
    headline: 'ヘッドライン',
    highlights: ['変更点 A'],
    impact: null,
    sourceReport: '2026-04-01-daily-research.md',
    sourceUrl: 'https://code.claude.com/docs/en/changelog',
    ...overrides,
  };
}

describe('normalizeImpact', () => {
  it('日本語表記を英語キーへ寄せる', () => {
    expect(normalizeImpact('高')).toBe('high');
    expect(normalizeImpact('中')).toBe('medium');
    expect(normalizeImpact('低')).toBe('low');
  });

  it('英語表記は大小文字と前後空白を吸収する', () => {
    expect(normalizeImpact(' HIGH ')).toBe('high');
    expect(normalizeImpact('Medium')).toBe('medium');
  });

  it('空文字・null・未知の値は null にする', () => {
    expect(normalizeImpact('')).toBeNull();
    expect(normalizeImpact(null)).toBeNull();
    expect(normalizeImpact(undefined)).toBeNull();
    expect(normalizeImpact('とても高い')).toBeNull();
  });
});

describe('canonicalVersion', () => {
  it('cli は先頭の v を落とす', () => {
    expect(canonicalVersion('cli', 'v2.1.224')).toBe('2.1.224');
    expect(canonicalVersion('cli', '2.1.224')).toBe('2.1.224');
  });

  it('model の裸の数値は Opus として補完する（レポート側の省略表記を吸収）', () => {
    expect(canonicalVersion('model', '5')).toBe('Opus 5');
    expect(canonicalVersion('model', '4.8')).toBe('Opus 4.8');
    expect(canonicalVersion('model', '4.7')).toBe('Opus 4.7');
  });

  it('model のモデル ID 表記を表示名へ寄せる', () => {
    expect(canonicalVersion('model', 'opus-5')).toBe('Opus 5');
    expect(canonicalVersion('model', 'claude-opus-5')).toBe('Opus 5');
  });

  it('すでに表示名のものはそのまま保つ', () => {
    expect(canonicalVersion('model', 'Sonnet 4.6')).toBe('Sonnet 4.6');
    expect(canonicalVersion('model', 'Fable 5')).toBe('Fable 5');
    expect(canonicalVersion('model', 'Mythos Preview')).toBe('Mythos Preview');
  });
});

describe('parseVersionRange', () => {
  it('単一バージョンは to を持たない', () => {
    expect(parseVersionRange('2.1.224')).toEqual({ from: '2.1.224', to: null });
  });

  it('ハイフン区切りの範囲表記を分解する', () => {
    expect(parseVersionRange('2.1.136-2.1.138')).toEqual({ from: '2.1.136', to: '2.1.138' });
  });

  it('全角ダッシュ区切りも分解する', () => {
    expect(parseVersionRange('2.1.150–2.1.157')).toEqual({ from: '2.1.150', to: '2.1.157' });
  });

  it('ハイフンを含むモデル ID を範囲と誤読しない', () => {
    expect(parseVersionRange('Mythos Preview')).toEqual({ from: 'Mythos Preview', to: null });
  });
});

describe('versionSortKey', () => {
  it('semver 風の版数を数値タプルにする', () => {
    expect(versionSortKey('2.1.224')).toEqual([2, 1, 224]);
  });

  it('数値比較なので桁数の違う版を辞書順で誤らない', () => {
    const keys = ['2.1.9', '2.1.100', '2.1.20'].map(versionSortKey);
    const sorted = [...keys].sort((a, b) => {
      if (a === null || b === null) return 0;
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    });
    expect(sorted).toEqual([
      [2, 1, 9],
      [2, 1, 20],
      [2, 1, 100],
    ]);
  });

  it('数値でない版は null', () => {
    expect(versionSortKey('Opus 5')).toBeNull();
  });
});

describe('entryId', () => {
  it('kind とバージョンから URL 安全な ID を作る', () => {
    expect(entryId('cli', '2.1.224')).toBe('cli-2-1-224');
    expect(entryId('model', 'Opus 5')).toBe('model-opus-5');
  });

  it('kind が違えば ID も衝突しない', () => {
    expect(entryId('cli', '5')).not.toBe(entryId('model', '5'));
  });
});

describe('normalizeReleases', () => {
  it('日付昇順・同日は版数昇順に並べる', () => {
    const entries = normalizeReleases([
      raw({ version: '2.1.102', date: '2026-04-02' }),
      raw({ version: '2.1.101', date: '2026-04-02' }),
      raw({ version: '2.1.100', date: '2026-04-01' }),
    ]);
    expect(entries.map((e) => e.version)).toEqual(['2.1.100', '2.1.101', '2.1.102']);
  });

  it('同一 kind・同一バージョンの重複を 1 件に統合する', () => {
    const entries = normalizeReleases([
      raw({ version: '2.1.90', highlights: ['A'], sourceReport: 'r1.md' }),
      raw({ version: 'v2.1.90', highlights: ['B'], sourceReport: 'r2.md' }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].highlights).toEqual(['A', 'B']);
    expect(entries[0].sources.map((s) => s.report)).toEqual(['r1.md', 'r2.md']);
  });

  it('統合時に重複する highlight を落とす', () => {
    const entries = normalizeReleases([
      raw({ version: '2.1.90', highlights: ['同じ変更点'] }),
      raw({ version: '2.1.90', highlights: ['同じ変更点', '別の変更点'], sourceReport: 'r2.md' }),
    ]);
    expect(entries[0].highlights).toEqual(['同じ変更点', '別の変更点']);
  });

  it('統合時は explicit な日付を report-date より優先する', () => {
    const entries = normalizeReleases([
      raw({ version: '2.1.147', date: '2026-05-23', dateConfidence: 'report-date' }),
      raw({
        version: '2.1.147',
        date: '2026-05-21',
        dateConfidence: 'explicit',
        sourceReport: 'r2.md',
      }),
    ]);
    expect(entries[0].date).toBe('2026-05-21');
    expect(entries[0].dateConfidence).toBe('explicit');
  });

  it('統合時は影響度の高いほうを残す（片方が null でも落とさない）', () => {
    const entries = normalizeReleases([
      raw({ version: '2.1.90', impact: null }),
      raw({ version: '2.1.90', impact: '高', sourceReport: 'r2.md' }),
    ]);
    expect(entries[0].impact).toBe('high');
  });

  it('範囲表記のバージョンは from を表示版・to を versionTo として保つ', () => {
    const entries = normalizeReleases([raw({ version: '2.1.136-2.1.138', date: '2026-05-09' })]);
    expect(entries[0].version).toBe('2.1.136');
    expect(entries[0].versionTo).toBe('2.1.138');
    expect(entries[0].sortKey).toEqual([2, 1, 136]);
  });

  it('cli と model は同じバージョン文字列でも別エントリのまま残す', () => {
    const entries = normalizeReleases([
      raw({ version: '5', kind: 'cli', date: '2026-07-24' }),
      raw({ version: '5', kind: 'model', date: '2026-07-24' }),
    ]);
    expect(entries).toHaveLength(2);
  });

  it('sourceUrl が無い出典も落とさず null として保持する', () => {
    const entries = normalizeReleases([raw({ sourceUrl: null })]);
    expect(entries[0].sources).toEqual([{ report: '2026-04-01-daily-research.md', url: null }]);
  });

  it('highlights が欠けていても空配列で通す', () => {
    const entries = normalizeReleases([raw({ highlights: null })]);
    expect(entries[0].highlights).toEqual([]);
  });
});

describe('summarizeByMonth', () => {
  it('月ごとに kind 別の件数を数える', () => {
    const entries = normalizeReleases([
      raw({ version: '2.1.100', date: '2026-04-01' }),
      raw({ version: '2.1.101', date: '2026-04-20' }),
      raw({ version: 'Opus 4.7', kind: 'model', date: '2026-04-16' }),
      raw({ version: '2.1.140', date: '2026-05-02' }),
    ]);
    expect(summarizeByMonth(entries)).toEqual([
      { month: '2026-04', cli: 2, model: 1 },
      { month: '2026-05', cli: 1, model: 0 },
    ]);
  });

  it('リリースが 1 件も無い月は行を作らない', () => {
    const entries = normalizeReleases([
      raw({ version: '2.1.100', date: '2026-03-01' }),
      raw({ version: '2.1.140', date: '2026-05-02' }),
    ]);
    expect(summarizeByMonth(entries).map((m) => m.month)).toEqual(['2026-03', '2026-05']);
  });
});
