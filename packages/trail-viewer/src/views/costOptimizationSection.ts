/**
 * CostOptimizationSection の vanilla 版（`components/CostOptimizationSection.tsx` の素 DOM 等価）。
 *
 * コスト最適化データがある場合に:
 *   - 3 枚のサマリカード（実績・最適化・削減率）
 *   - 期間別積み上げ棒チャート（Day/Week/Month トグル付き）
 *   - モデル分布 Pie チャート 2 枚（実績・推奨）
 * を素 DOM で描画する。data=null のとき何も表示しない（React 版と同様 return null）。
 * チャートは `anytimeChartView` の mountAnytimeChartView を再利用する。
 */
import {
  createPaper,
  createToggleButton,
  createToggleButtonGroup,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { CostOptimizationData } from '../domain/parser/types';
import { costChartColors } from '../theme/designTokens';
import { mountAnytimeChartView, type AnytimeChartViewProps } from './analytics/anytimeChartView';
import { buildStackedBarSpec } from '../components/analytics/charts/specs/buildStackedBarSpec';
import { buildPieSpec } from '../components/analytics/charts/specs/buildPieSpec';

export interface CostOptimizationSectionProps {
  readonly t: (key: string) => string;
  readonly data: CostOptimizationData | null;
  readonly isDark: boolean;
}

type PeriodMode = 'day' | 'week' | 'month';

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function aggregateByPeriod(
  daily: readonly CostOptimizationData['daily'][number][],
  mode: PeriodMode,
): Array<{ label: string; actualCost: number; skillCost: number }> {
  if (mode === 'day') {
    return daily.map((d) => ({ label: d.date.slice(5), actualCost: d.actualCost, skillCost: d.skillCost }));
  }

  const grouped = new Map<string, { actualCost: number; skillCost: number }>();
  for (const d of daily) {
    const dt = new Date(`${d.date}T12:00:00`);
    let key: string;
    if (mode === 'week') {
      const dayOfWeek = dt.getDay();
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - ((dayOfWeek + 6) % 7));
      const m = String(monday.getMonth() + 1).padStart(2, '0');
      const day = String(monday.getDate()).padStart(2, '0');
      key = `${m}-${day}`;
    } else {
      key = d.date.slice(0, 7);
    }
    const entry = grouped.get(key) ?? { actualCost: 0, skillCost: 0 };
    entry.actualCost += d.actualCost;
    entry.skillCost += d.skillCost;
    grouped.set(key, entry);
  }
  return [...grouped.entries()].map(([label, v]) => ({ label, ...v }));
}

function distToSlices(dist: Readonly<Record<string, number>>): Array<{ label: string; value: number }> {
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: k, value: v }));
}

export function mountCostOptimizationSection(
  container: HTMLElement,
  initial: CostOptimizationSectionProps,
): VanillaViewHandle<CostOptimizationSectionProps> {
  let props = initial;
  let periodMode: PeriodMode = 'day';
  let destroyed = false;

  // Chart handles for cleanup
  let barChartHandle: VanillaViewHandle<AnytimeChartViewProps> | null = null;
  let pieActualHandle: VanillaViewHandle<AnytimeChartViewProps> | null = null;
  let pieRecommendedHandle: VanillaViewHandle<AnytimeChartViewProps> | null = null;

  const root = document.createElement('div');
  container.appendChild(root);

  function buildContent(): void {
    // Destroy previous chart handles
    barChartHandle?.destroy();
    barChartHandle = null;
    pieActualHandle?.destroy();
    pieActualHandle = null;
    pieRecommendedHandle?.destroy();
    pieRecommendedHandle = null;
    root.replaceChildren();

    if (!props.data) return;

    const { actual, skillEstimate, modelDistribution, daily } = props.data;
    const savingsRate = actual.totalCost > 0
      ? ((actual.totalCost - skillEstimate.totalCost) / actual.totalCost) * 100
      : 0;
    const chartData = aggregateByPeriod(daily, periodMode);
    const actualSlices = distToSlices(modelDistribution.actual);
    const recommendedSlices = distToSlices(modelDistribution.skillRecommended);

    // Title
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'margin-bottom:8px;';
    const titleText = document.createElement('span');
    titleText.style.cssText = 'font-size:0.875rem;font-weight:600;';
    titleText.textContent = props.t('cost.title');
    titleEl.appendChild(titleText);
    root.appendChild(titleEl);

    // Summary Cards row
    const cardsRow = document.createElement('div');
    cardsRow.style.cssText = 'display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;';

    const cardDefs: Array<{ label: string; value: string; color: string }> = [
      { label: props.t('cost.current'), value: fmtUsd(actual.totalCost), color: costChartColors.actual },
      { label: props.t('cost.optimized'), value: fmtUsd(skillEstimate.totalCost), color: costChartColors.skill },
      {
        label: props.t('cost.potentialSavings'),
        value: `${savingsRate.toFixed(1)}%`,
        color: savingsRate > 0 ? costChartColors.skill : 'var(--am-color-text-primary)',
      },
    ];

    for (const c of cardDefs) {
      const { el: paper } = createPaper({
        variant: 'outlined',
        style: { padding: '12px', flex: '1', minWidth: '140px' },
      });
      const captionEl = document.createElement('span');
      captionEl.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);';
      captionEl.textContent = c.label;
      const valueEl = document.createElement('span');
      valueEl.style.cssText = `display:block;font-size:1.25rem;font-weight:700;color:${c.color};`;
      valueEl.textContent = c.value;
      paper.appendChild(captionEl);
      paper.appendChild(valueEl);
      cardsRow.appendChild(paper);
    }
    root.appendChild(cardsRow);

    // Period Chart card
    const { el: chartPaper } = createPaper({
      variant: 'outlined',
      style: { padding: '16px', marginBottom: '16px' },
    });

    // Chart header
    const chartHeader = document.createElement('div');
    chartHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
    const chartTitle = document.createElement('span');
    chartTitle.style.cssText = 'font-size:0.875rem;font-weight:600;';
    chartTitle.textContent = props.t('cost.costByPeriod');
    chartHeader.appendChild(chartTitle);

    // Period toggle button group
    const periodDefs: Array<{ value: PeriodMode; label: string }> = [
      { value: 'day', label: props.t('cost.day') },
      { value: 'week', label: props.t('cost.week') },
      { value: 'month', label: props.t('cost.month') },
    ];
    const toggleGroup = createToggleButtonGroup({
      size: 'small',
      value: periodMode,
      onChange: (v) => {
        if (destroyed) return;
        const newMode = v as PeriodMode;
        if (!newMode || newMode === periodMode) return;
        periodMode = newMode;
        buildContent();
      },
    });
    for (const d of periodDefs) {
      const btn = createToggleButton({ value: d.value, children: d.label });
      toggleGroup.register(btn);
      toggleGroup.el.appendChild(btn.el);
    }
    chartHeader.appendChild(toggleGroup.el);
    chartPaper.appendChild(chartHeader);

    // Bar chart or no-data text
    if (chartData.length > 0) {
      const barHost = document.createElement('div');
      chartPaper.appendChild(barHost);
      const spec = buildStackedBarSpec({
        categories: chartData.map((d) => d.label),
        series: [
          { name: props.t('cost.current'), values: chartData.map((d) => d.actualCost), color: costChartColors.actual },
          { name: props.t('cost.optimized'), values: chartData.map((d) => d.skillCost), color: costChartColors.skill },
        ],
        stacked: false,
      });
      barChartHandle = mountAnytimeChartView(barHost, { spec, isDark: props.isDark, height: 250 });
    } else {
      const noData = document.createElement('p');
      noData.style.cssText = 'text-align:center;padding:32px 0;color:var(--am-color-text-secondary);font-size:0.875rem;margin:0;';
      noData.textContent = props.t('cost.noData');
      chartPaper.appendChild(noData);
    }
    root.appendChild(chartPaper);

    // Model Distribution card
    const { el: distPaper } = createPaper({ variant: 'outlined', style: { padding: '16px' } });
    const distTitle = document.createElement('span');
    distTitle.style.cssText = 'display:block;font-size:0.875rem;font-weight:600;margin-bottom:8px;';
    distTitle.textContent = props.t('cost.modelDistribution');
    distPaper.appendChild(distTitle);

    const distRow = document.createElement('div');
    distRow.style.cssText = 'display:flex;gap:16px;justify-content:center;flex-wrap:wrap;';

    const pieItems: Array<{
      label: string;
      slices: Array<{ label: string; value: number }>;
      handleRef: 'pieActualHandle' | 'pieRecommendedHandle';
    }> = [
      { label: props.t('cost.current'), slices: actualSlices, handleRef: 'pieActualHandle' },
      { label: props.t('cost.optimized'), slices: recommendedSlices, handleRef: 'pieRecommendedHandle' },
    ];

    for (const pie of pieItems) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'text-align:center;';
      const caption = document.createElement('span');
      caption.style.cssText = 'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);';
      caption.textContent = pie.label;
      wrap.appendChild(caption);

      if (pie.slices.length > 0) {
        const pieHost = document.createElement('div');
        pieHost.style.cssText = 'width:200px;height:200px;';
        wrap.appendChild(pieHost);
        const spec = buildPieSpec(pie.slices, undefined, { compact: false });
        const handle = mountAnytimeChartView(pieHost, { spec, isDark: props.isDark, height: 200 });
        if (pie.handleRef === 'pieActualHandle') {
          pieActualHandle = handle;
        } else {
          pieRecommendedHandle = handle;
        }
      } else {
        const noData = document.createElement('span');
        noData.style.cssText = 'font-size:0.875rem;color:var(--am-color-text-secondary);';
        noData.textContent = props.t('cost.noDataShort');
        wrap.appendChild(noData);
      }
      distRow.appendChild(wrap);
    }

    distPaper.appendChild(distRow);
    root.appendChild(distPaper);
  }

  buildContent();

  return {
    update(next: CostOptimizationSectionProps) {
      props = next;
      buildContent();
    },
    destroy() {
      destroyed = true;
      barChartHandle?.destroy();
      pieActualHandle?.destroy();
      pieRecommendedHandle?.destroy();
      root.remove();
    },
  };
}
