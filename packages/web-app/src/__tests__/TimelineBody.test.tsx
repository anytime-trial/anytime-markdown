import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import TimelineBody from '../app/[locale]/timeline/TimelineBody';
import { normalizeInsights } from '../lib/insightTimeline/normalize';
import type { InsightTheme, RawInsight } from '../lib/insightTimeline/types';
import { normalizeReleases } from '../lib/releaseTimeline/normalize';
import type { RawRelease } from '../lib/releaseTimeline/types';

const RAW: RawRelease[] = [
  {
    version: '2.1.100',
    kind: 'cli',
    date: '2026-04-01',
    dateConfidence: 'explicit',
    headline: '通常リリースの見出し',
    highlights: ['通常の変更点'],
    impact: 'medium',
    sourceReport: '2026-04-01-daily-research.md',
    sourceUrl: 'https://code.claude.com/docs/en/changelog',
  },
  {
    version: '2.1.101',
    kind: 'cli',
    date: '2026-04-02',
    dateConfidence: 'report-date',
    headline: '高影響リリースの見出し',
    highlights: ['節目の変更点 A', '節目の変更点 B'],
    impact: '高',
    sourceReport: '2026-04-02-daily-research.md',
    sourceUrl: null,
  },
  {
    version: 'Opus 5',
    kind: 'model',
    date: '2026-05-10',
    dateConfidence: 'explicit',
    headline: 'モデルリリースの見出し',
    highlights: ['モデルの変更点'],
    impact: 'high',
    sourceReport: '2026-05-11-daily-research.md',
    sourceUrl: null,
  },
];

const INSIGHT_THEMES: InsightTheme[] = [
  { id: 'subagent', label: 'サブエージェントと並列実行', description: '委譲と並列度の設計' },
];

const INSIGHT_RAW: RawInsight[] = [
  {
    date: '2026-04-05',
    dateConfidence: 'explicit',
    category: 'claude-code',
    title: '上限が Workflow 設計を縛る',
    summary: 'スポーン上限が 200 件で、大規模並列は分割が要る。',
    themes: ['subagent'],
    impact: null,
    sourceReport: '2026-04-05-daily-research.md',
    sourceUrl: null,
  },
];

const INSIGHT = {
  entries: normalizeInsights(INSIGHT_RAW, INSIGHT_THEMES),
  themes: INSIGHT_THEMES,
  sourceReportCount: 1,
  period: { from: '2026-04-05', to: '2026-04-05' },
};

function renderBody(releaseEntries = normalizeReleases(RAW), sourceReportCount = 3) {
  return render(
    <TimelineBody
      release={{
        entries: releaseEntries,
        sourceReportCount,
        period: releaseEntries.length > 0 ? { from: '2026-04-01', to: '2026-05-10' } : null,
      }}
      insight={INSIGHT}
    />,
  );
}

/**
 * 表示切替のボタン。知見トラックのカテゴリ絞り込みにも「すべて」があるため、
 * 切り替え側はボタン群の accessible name で絞ってから引く
 */
function trackButton(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: '表示する内容を切り替える' })).getByRole(
    'button',
    { name },
  );
}

/** リリース側の live region。切り替えの告知と混ざらないようセクション内から引く */
function releaseStatus(): HTMLElement {
  return within(screen.getByRole('region', { name: 'リリース' })).getByRole('status');
}

describe('TimelineBody', () => {
  it('収録した全リリースを時系列で描画する', () => {
    renderBody();
    const cards = screen.getAllByTestId('release-card');
    expect(cards).toHaveLength(3);
    // 月グループは新しい順（上ほど最近）。2026-05 のモデルが先に来る
    expect(cards.map((c) => c.getAttribute('data-kind'))).toEqual(['model', 'cli', 'cli']);
  });

  it('月ごとに見出しを立てる', () => {
    renderBody();
    // 知見トラックのテーマ見出しにも月が入るので、リリース側に絞って引く
    const release = within(screen.getByRole('region', { name: 'リリース' }));
    expect(release.getByRole('heading', { name: /2026年4月/ })).toBeTruthy();
    expect(release.getByRole('heading', { name: /2026年5月/ })).toBeTruthy();
  });

  it('収録件数の内訳を出す', () => {
    renderBody();
    const stats = within(screen.getByRole('region', { name: 'リリース' })).getByText(
      '収録リリース',
    );
    expect(stats.nextElementSibling?.textContent).toBe('3 件');
  });

  it('影響度 高のリリースは変更点を開いた状態で出す', () => {
    renderBody();
    expect(screen.getByText('節目の変更点 A')).toBeTruthy();
    expect(screen.getByText('モデルの変更点')).toBeTruthy();
  });

  it('影響度 高でないリリースの変更点は畳んでおく', () => {
    renderBody();
    expect(screen.queryByText('通常の変更点')).toBeNull();
  });

  it('畳まれた変更点はトグルで開く', () => {
    renderBody();
    const card = screen
      .getAllByTestId('release-card')
      .find((c) => c.getAttribute('data-impact') === 'medium');
    // accessible name で引く。可視テキストがそのまま名前になっていること自体の検査でもある
    // （aria-label で名前を差し替えると WCAG 2.5.3 に反し、このクエリが落ちる）
    const toggle = within(card as HTMLElement).getByRole('button', { name: /変更点 1 件/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText('通常の変更点')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    // 開いている間だけ aria-controls を出す。閉状態で出すと存在しない ID を指す
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).toBeTruthy();
  });

  it('種別フィルタでモデルだけに絞れる', () => {
    renderBody();
    fireEvent.click(trackButton('モデル'));
    const cards = screen.getAllByTestId('release-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-kind')).toBe('model');
  });

  it('影響度 高のみのスイッチで節目だけに絞れる', () => {
    renderBody();
    fireEvent.click(screen.getByLabelText('影響度 高のみ'));
    const cards = screen.getAllByTestId('release-card');
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.getAttribute('data-impact') === 'high')).toBe(true);
  });

  it('種別と影響度の絞り込みは重ねて効く', () => {
    renderBody();
    fireEvent.click(trackButton('Claude Code'));
    fireEvent.click(screen.getByLabelText('影響度 高のみ'));
    const cards = screen.getAllByTestId('release-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-kind')).toBe('cli');
    expect(cards[0].getAttribute('data-impact')).toBe('high');
  });

  it('該当が 0 件なら空だと明示する（黙って白紙にしない）', () => {
    renderBody([], 0);
    expect(screen.queryAllByTestId('release-card')).toHaveLength(0);
    expect(screen.getByText(/条件に合うリリースがありません/)).toBeTruthy();
  });

  it('リリース日が推定のものには支援技術へも届く印を付ける', () => {
    renderBody();
    // getByLabelText は DOM 属性検索なので aria-hidden な要素も拾う。MUI の SvgIcon は
    // titleAccess が無いと aria-hidden="true" を出すため、role 経由で accessible name を主張する
    expect(screen.getByRole('img', { name: '日付は推定' })).toBeTruthy();
  });

  it('絞り込み結果の件数を live region で知らせる', () => {
    renderBody();
    expect(releaseStatus().textContent).toContain('3 件を表示中');

    fireEvent.click(trackButton('モデル'));
    expect(releaseStatus().textContent).toContain('1 件を表示中');
  });

  it('0 件になったことも同じ live region で知らせる', () => {
    renderBody([], 0);
    expect(releaseStatus().textContent).toMatch(/条件に合うリリースがありません/);
  });

  it('既定ではリリースと知見の両方を出す', () => {
    renderBody();
    expect(screen.getByRole('region', { name: 'リリース' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '知見の経緯' })).toBeTruthy();
  });

  it('「知見」へ切り替えるとリリースが支援技術から消えて知見だけになる', () => {
    renderBody();
    fireEvent.click(trackButton('知見'));
    // 出さないトラックは DOM には残る（子の状態を捨てないため）。見えているかどうかは
    // アクセシビリティツリー基準で検査する — testid は hidden を見ないので使わない
    expect(screen.queryByRole('region', { name: 'リリース' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'リリース' })).toBeNull();
    expect(screen.getByRole('region', { name: '知見の経緯' })).toBeTruthy();
  });

  it('リリースの種別へ切り替えると知見は出さない', () => {
    renderBody();
    fireEvent.click(trackButton('Claude Code'));
    expect(screen.getByRole('region', { name: 'リリース' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: '知見の経緯' })).toBeNull();
  });

  it('知見だけの表示では影響度スイッチを出さない（効く相手が無い）', () => {
    renderBody();
    expect(screen.getByLabelText('影響度 高のみ')).toBeTruthy();
    fireEvent.click(trackButton('知見'));
    expect(screen.queryByLabelText('影響度 高のみ')).toBeNull();
  });

  it('切り替えの告知は同じ live region ノードのまま文言だけ変わる', () => {
    renderBody();
    const announcer = screen
      .getAllByRole('status')
      .find((s) => s.textContent?.includes('リリースと知見の両方を表示中'));
    expect(announcer).toBeDefined();

    // 作り直された live region は読み上げられないことがある。ノードが生き残ることが契約
    fireEvent.click(trackButton('知見'));
    expect(screen.getAllByRole('status')).toContain(announcer);
    expect(announcer?.textContent).toContain('知見の経緯を表示中');

    fireEvent.click(trackButton('Claude Code'));
    expect(screen.getAllByRole('status')).toContain(announcer);
    expect(announcer?.textContent).toContain('Claude Code 本体のリリースを表示中');
  });

  it('切り替えを往復しても知見トラックで開いたものは閉じない', () => {
    renderBody();
    const insight = () => within(screen.getByRole('region', { name: '知見の経緯' }));
    // 既定で開くのは上位 3 テーマまで。フィクスチャは 1 テーマなので開いている
    const theme = insight().getByRole('button', { expanded: true });
    fireEvent.click(theme);
    expect(insight().getByRole('button', { expanded: false })).toBeTruthy();

    fireEvent.click(trackButton('Claude Code'));
    fireEvent.click(trackButton('すべて'));
    expect(insight().getByRole('button', { expanded: false })).toBeTruthy();
  });

  it('切り替えを往復しても影響度スイッチの設定は残る', () => {
    renderBody();
    fireEvent.click(screen.getByLabelText('影響度 高のみ'));
    expect(screen.getAllByTestId('release-card')).toHaveLength(2);

    fireEvent.click(trackButton('知見'));
    fireEvent.click(trackButton('すべて'));
    expect((screen.getByLabelText('影響度 高のみ') as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByTestId('release-card')).toHaveLength(2);
  });

  it('月別リリース件数のバーが内訳を accessible name で持つ', () => {
    renderBody();
    // 積み上げの内訳は色でしか表現できないため、名前として言えていないと伝わらない
    expect(
      screen.getByRole('img', { name: '2026年4月: Claude Code 2 件・Claude モデル 0 件' }),
    ).toBeTruthy();
  });

  it('月別リリース件数のバーを絞り込みに追従させる', () => {
    renderBody();
    expect(screen.getAllByTestId('cadence-bar')).toHaveLength(2);
    fireEvent.click(trackButton('モデル'));
    expect(screen.getAllByTestId('cadence-bar')).toHaveLength(1);
  });
});
