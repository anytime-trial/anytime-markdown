import {
  buildThemeTracks,
  insightId,
  InsightSchemaError,
  normalizeInsights,
  normalizeInsightsWithDiagnostics,
} from '../lib/insightTimeline/normalize';
import type { InsightTheme, RawInsight } from '../lib/insightTimeline/types';

const THEMES: readonly InsightTheme[] = [
  {
    id: 'subagent',
    label: 'サブエージェント',
    description: '並列委譲と回転の運用',
  },
  { id: 'sandbox', label: 'サンドボックス', description: '実行隔離と権限境界' },
  { id: 'cost', label: 'トークンコスト', description: '消費量と予算管理' },
];

function raw(overrides: Partial<RawInsight> = {}): RawInsight {
  return {
    date: '2026-05-12',
    dateConfidence: 'explicit',
    category: 'claude-code',
    title: '200 件上限が Workflow 設計を縛る',
    summary: '1 Workflow あたりのスポーン上限が 200 件で、大規模並列は分割が要る。',
    themes: ['subagent'],
    impact: null,
    sourceReport: '2026-05-12-daily-research.md',
    sourceUrl: 'https://code.claude.com/docs/en/changelog',
    ...overrides,
  };
}

describe('insightId', () => {
  it('日付とタイトルから安定 ID を作る', () => {
    expect(insightId('2026-05-12', 'Subagent limit lifted')).toMatch(
      /^2026-05-12-subagent-limit-lifted-[0-9a-z]+$/,
    );
  });

  it('先頭の英字語だけが同じ日本語タイトルに別々の ID を与える', () => {
    // 非 ASCII を落とすスラッグだけで ID を作ると、どちらも 2026-04-26-claude-md になる
    const a = insightId('2026-04-26', 'CLAUDE.md+スラッシュコマンドで業務委任を構造化');
    const b = insightId('2026-04-26', 'CLAUDE.mdには繰り返すミスだけを書け');
    expect(a).not.toBe(b);
  });

  it('日本語だけのタイトルでも日付が衝突しない ID を作る', () => {
    const a = insightId('2026-05-12', 'サブエージェント上限');
    const b = insightId('2026-05-12', 'サンドボックスの境界');
    expect(a).not.toBe(b);
    expect(a.startsWith('2026-05-12-')).toBe(true);
  });
});

describe('normalizeInsights', () => {
  it('影響度の日本語表記を英語キーへ寄せる', () => {
    const [entry] = normalizeInsights([raw({ impact: '高' })], THEMES);
    expect(entry.impact).toBe('high');
  });

  it('影響度が書かれていなければ null のままにする（自分で格付けしない）', () => {
    const [entry] = normalizeInsights([raw({ impact: null })], THEMES);
    expect(entry.impact).toBeNull();
  });

  it('成果物は日付昇順で確定する（再生成のたびに同じ並びになる）', () => {
    const entries = normalizeInsights(
      [
        raw({ date: '2026-08-07', title: '上限撤廃' }),
        raw({ date: '2026-05-12', title: '上限が縛る' }),
        raw({ date: '2026-07-03', title: '回転が定着' }),
      ],
      THEMES,
    );
    expect(entries.map((e) => e.date)).toEqual(['2026-05-12', '2026-07-03', '2026-08-07']);
  });

  it('同じ日・同じタイトルの重複は 1 件へ畳み、出典を束ねる', () => {
    const entries = normalizeInsights(
      [
        raw({ sourceReport: 'a.md' }),
        raw({
          sourceReport: 'b.md',
          themes: ['subagent', 'cost'],
          impact: '中',
        }),
      ],
      THEMES,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].sources.map((s) => s.report)).toEqual(['a.md', 'b.md']);
    expect(entries[0].themes).toEqual(['subagent', 'cost']);
    expect(entries[0].impact).toBe('medium');
  });

  it('統合時は強いほうの影響度を残す（再掲で格下げしない）', () => {
    const entries = normalizeInsights(
      [raw({ impact: '高', sourceReport: 'a.md' }), raw({ impact: '低', sourceReport: 'b.md' })],
      THEMES,
    );
    expect(entries[0].impact).toBe('high');
  });

  it('先頭の英字語だけが同じ別の知見を統合しない', () => {
    const entries = normalizeInsights(
      [
        raw({ date: '2026-04-26', title: 'CLAUDE.md+スラッシュコマンドで業務委任を構造化' }),
        raw({ date: '2026-04-26', title: 'CLAUDE.mdには繰り返すミスだけを書け' }),
      ],
      THEMES,
    );
    expect(entries).toHaveLength(2);
  });

  it('統合したものを診断として持ち上げる（件数差の説明がつくようにする）', () => {
    const { entries, merges } = normalizeInsightsWithDiagnostics(
      [raw({ sourceReport: 'a.md' }), raw({ sourceReport: 'b.md' }), raw({ title: '別の知見' })],
      THEMES,
    );
    expect(entries).toHaveLength(2);
    expect(merges).toHaveLength(1);
    expect(merges[0].reports).toEqual(['a.md', 'b.md']);
  });

  it('影響度が辞書に無い表記なら例外で落とす（null へ倒して「記載なし」に化けさせない）', () => {
    expect(() => normalizeInsights([raw({ impact: 'critical' })], THEMES)).toThrow(
      InsightSchemaError,
    );
  });

  it('辞書に無いテーマ id は例外で落とす（黙って捨てない）', () => {
    expect(() => normalizeInsights([raw({ themes: ['unknown-theme'] })], THEMES)).toThrow(
      InsightSchemaError,
    );
  });

  it('テーマが空の知見は例外で落とす（どの経緯にも並ばず消えるため）', () => {
    expect(() => normalizeInsights([raw({ themes: [] })], THEMES)).toThrow(InsightSchemaError);
  });

  it('YYYY-MM-DD でない日付は例外で落とす', () => {
    expect(() => normalizeInsights([raw({ date: '2026/05/12' })], THEMES)).toThrow(
      InsightSchemaError,
    );
  });

  it('未知のカテゴリは例外で落とす', () => {
    expect(() => normalizeInsights([raw({ category: 'economy' as never })], THEMES)).toThrow(
      InsightSchemaError,
    );
  });

  it('タイトルか要約が空なら例外で落とす', () => {
    expect(() => normalizeInsights([raw({ title: '   ' })], THEMES)).toThrow(InsightSchemaError);
    expect(() => normalizeInsights([raw({ summary: '' })], THEMES)).toThrow(InsightSchemaError);
  });
});

describe('buildThemeTracks', () => {
  const entries = normalizeInsights(
    [
      raw({ date: '2026-08-07', title: '上限撤廃', themes: ['subagent'] }),
      raw({ date: '2026-05-12', title: '上限が縛る', themes: ['subagent'] }),
      raw({
        date: '2026-07-03',
        title: '回転が定着',
        themes: ['subagent', 'cost'],
      }),
      raw({ date: '2026-04-02', title: '権限境界', themes: ['sandbox'] }),
    ],
    THEMES,
  );

  it('件数の多いテーマを先に並べる', () => {
    const tracks = buildThemeTracks(entries, THEMES);
    expect(tracks.map((t) => t.themeId)).toEqual(['subagent', 'cost', 'sandbox']);
  });

  it('テーマ内は日付降順（新しい順）で、収録範囲は両端から取る', () => {
    const [subagent] = buildThemeTracks(entries, THEMES);
    expect(subagent.entries.map((e) => e.date)).toEqual(['2026-08-07', '2026-07-03', '2026-05-12']);
    // 並びが降順でも、収録範囲は「古い〜新しい」の向きで出す
    expect(subagent.from).toBe('2026-05-12');
    expect(subagent.to).toBe('2026-08-07');
  });

  it('昇順で渡されても降順で渡されても同じ並びになる', () => {
    const ascending = buildThemeTracks(entries, THEMES)[0].entries.map((e) => e.date);
    const descending = buildThemeTracks([...entries].reverse(), THEMES)[0].entries.map(
      (e) => e.date,
    );
    expect(descending).toEqual(ascending);
  });

  it('1 件も無いテーマはトラックを作らない（空の見出しを出さない）', () => {
    const tracks = buildThemeTracks(entries.slice(0, 1), THEMES);
    expect(tracks.map((t) => t.themeId)).toEqual(['sandbox']);
  });

  it('同数のテーマは id の序数順で決める（環境で並びが変わらない）', () => {
    const tracks = buildThemeTracks(entries.slice(2, 3), THEMES);
    expect(tracks.map((t) => t.themeId)).toEqual(['cost', 'subagent']);
  });
});
