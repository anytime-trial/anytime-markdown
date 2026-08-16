import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import TimelineBody from '../app/[locale]/timeline/TimelineBody';
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

function renderBody() {
  return render(
    <TimelineBody
      entries={normalizeReleases(RAW)}
      sourceReportCount={3}
      period={{ from: '2026-04-01', to: '2026-05-10' }}
    />,
  );
}

describe('TimelineBody', () => {
  it('収録した全リリースを時系列で描画する', () => {
    renderBody();
    const cards = screen.getAllByTestId('release-card');
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.getAttribute('data-kind'))).toEqual(['cli', 'cli', 'model']);
  });

  it('月ごとに見出しを立てる', () => {
    renderBody();
    expect(screen.getByRole('heading', { name: /2026年4月/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /2026年5月/ })).toBeTruthy();
  });

  it('収録件数の内訳を出す', () => {
    renderBody();
    const stats = screen.getByRole('heading', { level: 1 }).parentElement?.nextElementSibling;
    expect(stats?.textContent).toContain('3 件');
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
    fireEvent.click(screen.getByRole('button', { name: 'モデル' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }));
    fireEvent.click(screen.getByLabelText('影響度 高のみ'));
    const cards = screen.getAllByTestId('release-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-kind')).toBe('cli');
    expect(cards[0].getAttribute('data-impact')).toBe('high');
  });

  it('該当が 0 件なら空だと明示する（黙って白紙にしない）', () => {
    render(<TimelineBody entries={[]} sourceReportCount={0} period={null} />);
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
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('3 件を表示中');

    fireEvent.click(screen.getByRole('button', { name: 'モデル' }));
    expect(status.textContent).toContain('1 件を表示中');
  });

  it('0 件になったことも同じ live region で知らせる', () => {
    render(<TimelineBody entries={[]} sourceReportCount={0} period={null} />);
    expect(screen.getByRole('status').textContent).toMatch(/条件に合うリリースがありません/);
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
    fireEvent.click(screen.getByRole('button', { name: 'モデル' }));
    expect(screen.getAllByTestId('cadence-bar')).toHaveLength(1);
  });
});
