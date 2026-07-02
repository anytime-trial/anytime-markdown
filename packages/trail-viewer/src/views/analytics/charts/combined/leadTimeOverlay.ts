/**
 * vanilla 版 LeadTimeOverlay
 * (`components/analytics/charts/combined/LeadTimeOverlay.tsx` の素 DOM 等価)。
 */
import type { ChartSpec, Series } from '@anytime-markdown/chart-core';
import { capTopN } from '../../../../domain/analytics/calculators';
import { LEAD_TIME_LOC_COLOR } from '../../../../theme/designTokens';
import { mountAnytimeChartView } from '../../anytimeChartView';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

export interface LeadTimeOverlayProps {
  leadTimeOverlay: {
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    unmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    byPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
  } | null;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
  isDark: boolean;
  toolPalette: readonly string[];
  cardSx: { bgcolor: string; border: string; borderRadius: string };
}

function buildResult(p: LeadTimeOverlayProps): { spec: ChartSpec; fullDates: string[] } | null {
  const ratioRows = p.leadTimeOverlay?.leadTimePerLoc ?? [];
  const byPrefixSeries = p.leadTimeOverlay?.byPrefix.series ?? [];
  const allPrefixes = p.leadTimeOverlay?.byPrefix.prefixes ?? [];

  if (byPrefixSeries.length === 0 && ratioRows.length === 0) return null;

  const ltTotals = new Map<string, number>();
  for (const row of byPrefixSeries) {
    for (const [pf, v] of Object.entries(row.byPrefix)) {
      ltTotals.set(pf, (ltTotals.get(pf) ?? 0) + v);
    }
  }
  const ltCap = capTopN(ltTotals);
  const ltPrefixes = ltCap.displayKeys;
  const ltMap = ltCap.keyMap;

  const bucketKeys = [...new Set([
    ...byPrefixSeries.map((r) => r.bucketStart),
    ...ratioRows.map((r) => r.bucketStart),
  ])].sort();
  const ratioByBucket = new Map(ratioRows.map((r) => [r.bucketStart, r.value]));
  const prefixRowByBucket = new Map(byPrefixSeries.map((r) => [r.bucketStart, r.byPrefix]));
  const fullDates = bucketKeys.map((b) => b.slice(0, 10));
  const labelsArr = bucketKeys.map((b) => b.slice(5, 10));

  const aggByBucket = bucketKeys.map((b) => {
    const byPrefixMap = prefixRowByBucket.get(b) ?? {};
    const aggregated: Record<string, number> = {};
    for (const pf of ltPrefixes) aggregated[pf] = 0;
    for (const origPrefix of allPrefixes) {
      const displayKey = ltMap.get(origPrefix) ?? origPrefix;
      aggregated[displayKey] = (aggregated[displayKey] ?? 0) + (byPrefixMap[origPrefix] ?? 0);
    }
    return aggregated;
  });

  const barSeries: Series[] = ltPrefixes.map((prefix, i) => ({
    name: prefix,
    type: 'bar',
    color: p.toolPalette[i % p.toolPalette.length],
    values: aggByBucket.map((agg) => agg[prefix] ?? 0),
  }));
  const lineSeries: Series[] = [{
    name: 'Lead Time / LOC (min/LOC)',
    type: 'line',
    axis: 'right',
    color: LEAD_TIME_LOC_COLOR,
    connectNulls: true,
    values: bucketKeys.map((b) => ratioByBucket.get(b) ?? null),
  }];
  const spec: ChartSpec = {
    kind: 'combo',
    categories: labelsArr,
    series: [...barSeries, ...lineSeries],
    options: { stacked: true, legend: 'bottom', yAxis: { label: 'min' }, yAxisRight: { label: 'min/LOC' } },
  };
  return { spec, fullDates };
}

function applyCardStyle(card: HTMLElement, cardSx: { bgcolor: string; border: string; borderRadius: string }): void {
  card.style.backgroundColor = cardSx.bgcolor;
  card.style.border = cardSx.border;
  card.style.borderRadius = cardSx.borderRadius;
  card.style.padding = '16px';
}

export function mountLeadTimeOverlay(
  container: HTMLElement,
  initial: LeadTimeOverlayProps,
): VanillaViewHandle<LeadTimeOverlayProps> {
  let props = initial;
  let fullDates: string[] = [];

  const card = document.createElement('div');
  container.appendChild(card);

  const emptyEl = document.createElement('p');
  emptyEl.style.cssText = 'margin:0;font-size:0.875rem;color:var(--am-color-text-secondary);';
  emptyEl.textContent = '0';

  let chartHandle: ReturnType<typeof mountAnytimeChartView> | null = null;

  function onCategoryClick(idx: number): void {
    if (props.canDrill && idx >= 0 && idx < fullDates.length) {
      props.onDateClick?.(fullDates[idx]);
    }
  }

  function render(p: LeadTimeOverlayProps): void {
    const result = buildResult(p);
    if (!result) {
      chartHandle?.destroy();
      chartHandle = null;
      card.removeAttribute('style');
      card.replaceChildren(emptyEl);
      return;
    }
    fullDates = result.fullDates;
    applyCardStyle(card, p.cardSx);
    if (emptyEl.isConnected) emptyEl.remove();
    if (!chartHandle) {
      chartHandle = mountAnytimeChartView(card, {
        spec: result.spec,
        height: 260,
        isDark: p.isDark,
        onCategoryClick: p.canDrill ? onCategoryClick : undefined,
      });
    } else {
      chartHandle.update({
        spec: result.spec,
        height: 260,
        isDark: p.isDark,
        onCategoryClick: p.canDrill ? onCategoryClick : undefined,
      });
    }
  }

  render(props);

  return {
    update(next) {
      props = next;
      render(next);
    },
    destroy() {
      chartHandle?.destroy();
      card.remove();
    },
  };
}
