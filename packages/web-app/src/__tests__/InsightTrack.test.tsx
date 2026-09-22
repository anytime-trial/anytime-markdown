import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import InsightTrack from '../app/[locale]/timeline/components/InsightTrack';
import { normalizeInsights } from '../lib/insightTimeline/normalize';
import type { InsightTheme, RawInsight } from '../lib/insightTimeline/types';

const THEMES: InsightTheme[] = [
  { id: 'subagent', label: 'サブエージェントと並列実行', description: '委譲と並列度の設計' },
  { id: 'security', label: 'セキュリティと脆弱性', description: 'CVE と攻撃事例' },
  { id: 'token-cost', label: 'トークンとコスト', description: '消費量と課金' },
  { id: 'dev-culture', label: '開発文化と語彙', description: '新語彙と規範の変化' },
];

function raw(overrides: Partial<RawInsight> = {}): RawInsight {
  return {
    date: '2026-05-12',
    dateConfidence: 'explicit',
    category: 'claude-code',
    title: '既定のタイトル',
    summary: '既定の要約。',
    themes: ['subagent'],
    impact: null,
    sourceReport: '2026-05-12-daily-research.md',
    sourceUrl: null,
    ...overrides,
  };
}

const RAW: RawInsight[] = [
  raw({ date: '2026-04-02', title: '上限が Workflow 設計を縛る' }),
  raw({ date: '2026-07-03', title: '回転で文脈を切る運用が定着', impact: '中' }),
  raw({ date: '2026-08-07', title: '上限が撤廃される', impact: '高' }),
  raw({ date: '2026-04-10', title: 'サンドボックス回避の修正', themes: ['security'] }),
  raw({
    date: '2026-05-20',
    title: '供給網経由の攻撃事例',
    themes: ['security'],
    category: 'tech-trend',
  }),
  raw({
    date: '2026-06-01',
    title: 'トークン予算という考え方',
    themes: ['token-cost'],
    category: 'vocabulary',
    dateConfidence: 'report-date',
  }),
  raw({
    date: '2026-06-02',
    title: 'slop PR という語が定着',
    themes: ['dev-culture'],
    category: 'vocabulary',
  }),
];

function renderTrack() {
  return render(
    <InsightTrack entries={normalizeInsights(RAW, THEMES)} themes={THEMES} sourceReportCount={7} />,
  );
}

describe('InsightTrack', () => {
  it('件数の多いテーマから順にトラックを立て、見出しに件数と収録範囲を出す', () => {
    renderTrack();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'サブエージェントと並列実行 3 件 · 2026年4月〜8月',
      'セキュリティと脆弱性 2 件 · 2026年4月〜5月',
      '開発文化と語彙 1 件 · 2026年6月',
      'トークンとコスト 1 件 · 2026年6月',
    ]);
  });

  it('既定では上位 3 テーマだけ開く', () => {
    renderTrack();
    const buttons = screen.getAllByRole('button', { expanded: true });
    expect(buttons).toHaveLength(3);
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(1);
  });

  it('テーマ内は古い順に並べ、経緯として読めるようにする', () => {
    renderTrack();
    const cards = screen.getAllByTestId('insight-card');
    const subagentDates = cards.slice(0, 3).map((c) => within(c).getByText(/^2026\//).textContent);
    expect(subagentDates).toEqual(['2026/4/2', '2026/7/3', '2026/8/7']);
  });

  it('カテゴリで絞り込むとトラックと件数が追従する', () => {
    renderTrack();
    fireEvent.click(screen.getByRole('button', { name: '新語彙' }));
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      '開発文化と語彙 1 件 · 2026年6月',
      'トークンとコスト 1 件 · 2026年6月',
    ]);
    expect(screen.getByRole('status').textContent).toMatch(/2 件を 2 テーマで表示中/);
  });

  it('絞り込みで空になったことを live region で伝える', () => {
    renderTrack();
    fireEvent.click(screen.getByRole('button', { name: 'エコシステム' }));
    expect(screen.getByRole('status').textContent).toMatch(/条件に合う知見がありません/);
  });

  it('推定日には理由を支援技術へ伝えるアイコンを添える', () => {
    renderTrack();
    fireEvent.click(screen.getByRole('button', { name: '新語彙' }));
    expect(screen.getByRole('img', { name: '日付は推定' })).toBeTruthy();
  });

  it('件数の多いトラックは頭から 20 件だけ描き、残りは操作で伸ばす', () => {
    const many: RawInsight[] = Array.from({ length: 25 }, (_, i) =>
      raw({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, title: `知見 ${i + 1}` }),
    );
    render(
      <InsightTrack
        entries={normalizeInsights(many, THEMES)}
        themes={THEMES}
        sourceReportCount={1}
      />,
    );
    expect(screen.getAllByTestId('insight-card')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: '残り 5 件を表示' }));
    expect(screen.getAllByTestId('insight-card')).toHaveLength(25);
  });

  it('開いたテーマは絞り込みを変えても勝手に閉じない', () => {
    renderTrack();
    const fourth = screen.getByRole('button', { expanded: false });
    fireEvent.click(fourth);
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(4);
  });
});
