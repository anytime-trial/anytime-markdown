/**
 * AnalyticsPanelSkeleton の vanilla 版（`components/shared/AnalyticsPanelSkeleton.tsx` の素 DOM 等価）。
 *
 * 4 列の KPI カード行 + 日次チャート + テーブルのプレースホルダーを素 DOM で描画する。
 */
import { createSkeleton } from '@anytime-markdown/ui-core';

/** AnalyticsPanelSkeleton を container へマウントし、root 要素を返す（{el} パターン）。 */
export function mountAnalyticsPanelSkeleton(container: HTMLElement): { el: HTMLElement } {
  const root = document.createElement('div');
  root.style.cssText = 'padding:16px;';

  // 4 KPI card row
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:16px;margin-bottom:16px;';
  for (let i = 0; i < 4; i++) {
    const { el } = createSkeleton({ variant: 'rectangular', style: { width: '25%', height: '140px' } });
    row.appendChild(el);
  }
  root.appendChild(row);

  // Daily chart
  const { el: chart } = createSkeleton({
    variant: 'rectangular',
    style: { width: '100%', height: '280px', marginBottom: '16px' },
  });
  root.appendChild(chart);

  // Table
  const { el: table } = createSkeleton({
    variant: 'rectangular',
    style: { width: '100%', height: '400px' },
  });
  root.appendChild(table);

  container.appendChild(root);
  return { el: root };
}
