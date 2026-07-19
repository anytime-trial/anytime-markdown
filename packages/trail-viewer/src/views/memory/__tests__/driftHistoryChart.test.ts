/**
 * Phase 6 S5-C: ドリフト推移チャート（FR-27）。
 * jsdom では実チャート描画を検証できないため、spec 構築と空状態の縮退を固定する。
 */
import type { DriftHistoryPoint } from '@anytime-markdown/trail-core';
import { buildDriftHistorySpec, mountDriftHistoryChart } from '../driftHistoryChart';

const t = (key: string): string => key;

function points(): DriftHistoryPoint[] {
  return [
    { date: '2026-07-01', detectedCount: 2, resolvedCount: 0, unresolvedCumulative: 2 },
    { date: '2026-07-02', detectedCount: 0, resolvedCount: 1, unresolvedCumulative: 1 },
  ];
}

describe('buildDriftHistorySpec', () => {
  test('検知・解決・未解決累計の 3 系列を日付順で組む', () => {
    const spec = buildDriftHistorySpec({ t, points: points() });
    expect(spec.kind).toBe('line');
    expect(spec.categories).toEqual(['2026-07-01', '2026-07-02']);
    expect(spec.series.map((s) => s.name)).toEqual([
      'memory.drift.history.detected',
      'memory.drift.history.resolved',
      'memory.drift.history.unresolved',
    ]);
    expect(spec.series[0].values).toEqual([2, 0]);
    expect(spec.series[1].values).toEqual([0, 1]);
    expect(spec.series[2].values).toEqual([2, 1]);
  });

  test('系列には色に加えて凡例名が付く（色のみに依存しない）', () => {
    const spec = buildDriftHistorySpec({ t, points: points() });
    expect(spec.series.every((s) => Boolean(s.name) && Boolean(s.color))).toBe(true);
  });

  test('0 件の日も系列値として残る（欠測で線が飛ばない）', () => {
    const spec = buildDriftHistorySpec({
      t,
      points: [
        { date: '2026-07-01', detectedCount: 1, resolvedCount: 0, unresolvedCumulative: 1 },
        { date: '2026-07-02', detectedCount: 0, resolvedCount: 0, unresolvedCumulative: 1 },
      ],
    });
    expect(spec.series[0].values).toEqual([1, 0]);
  });
});

describe('mountDriftHistoryChart', () => {
  test('データが無ければ空状態メッセージへ縮退する', () => {
    const host = document.createElement('div');
    const handle = mountDriftHistoryChart(host, { t, points: [] });
    expect(host.textContent).toContain('memory.drift.history.empty');
    handle.destroy();
  });

  test('空 → データありへ更新すると空状態メッセージが消える', () => {
    const host = document.createElement('div');
    const handle = mountDriftHistoryChart(host, { t, points: [] });
    handle.update({ t, points: points() });
    expect(host.textContent).not.toContain('memory.drift.history.empty');
    handle.destroy();
  });

  test('destroy で DOM から取り除く', () => {
    const host = document.createElement('div');
    const handle = mountDriftHistoryChart(host, { t, points: points() });
    handle.destroy();
    expect(host.children).toHaveLength(0);
  });

  test('aria-label が付く', () => {
    const host = document.createElement('div');
    const handle = mountDriftHistoryChart(host, { t, points: points() });
    expect(host.querySelector('[aria-label="memory.drift.history.title"]')).not.toBeNull();
    handle.destroy();
  });
});
