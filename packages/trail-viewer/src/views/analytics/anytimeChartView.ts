/**
 * `<anytime-chart>`（chart-core WC）を素 DOM で包む vanilla ホスト。
 * `components/analytics/charts/AnytimeChartView.tsx` の React 非依存版。
 *
 * 副作用 import で customElements.define を発火させ、要素生成後に `.spec` を流す。
 * theme（dark/light）/ palette は属性で同期、category-click を onCategoryClick へ橋渡しする。
 * テーマは React Context ではなく props（isDark）で受ける。枠（Paper 等）は呼び元が持つ。
 */
import type { ChartSpec } from '@anytime-markdown/chart-core';
import type { VanillaViewHandle } from '../../shared/vanillaIsland';

interface AnytimeChartElement extends HTMLElement {
  spec: ChartSpec;
}

export interface AnytimeChartViewProps {
  spec: ChartSpec;
  height?: number;
  palette?: string;
  isDark?: boolean;
  /** カテゴリ（分類軸バンド）クリック時に dataIndex を返す（日付ドリルダウン等）。 */
  onCategoryClick?: (dataIndex: number) => void;
}

export function mountAnytimeChartView(
  container: HTMLElement,
  initial: AnytimeChartViewProps,
): VanillaViewHandle<AnytimeChartViewProps> {
  let props = initial;
  let el: AnytimeChartElement | null = null;
  let cancelled = false;

  const host = document.createElement('div');
  host.style.width = '100%';
  host.style.height = `${props.height ?? 300}px`;
  container.appendChild(host);

  const onClick = (e: Event): void => {
    const idx = (e as CustomEvent<{ dataIndex: number }>).detail?.dataIndex;
    if (typeof idx === 'number') props.onCategoryClick?.(idx);
  };

  void (async () => {
    await import('@anytime-markdown/chart-core/element');
    if (cancelled) return;
    el = document.createElement('anytime-chart') as AnytimeChartElement;
    el.setAttribute('theme', props.isDark ? 'dark' : 'light');
    if (props.palette) el.setAttribute('palette', props.palette);
    el.style.width = '100%';
    el.style.height = '100%';
    el.addEventListener('category-click', onClick);
    host.append(el);
    el.spec = props.spec;
  })();

  return {
    update(next) {
      const prev = props;
      props = next;
      if (next.height !== prev.height) host.style.height = `${next.height ?? 300}px`;
      if (!el) return;
      if (next.isDark !== prev.isDark) {
        el.setAttribute('theme', next.isDark ? 'dark' : 'light');
      }
      if (next.palette && next.palette !== prev.palette) {
        el.setAttribute('palette', next.palette);
      }
      if (next.spec !== prev.spec) el.spec = next.spec;
    },
    destroy() {
      cancelled = true;
      el?.removeEventListener('category-click', onClick);
      el?.remove();
      el = null;
      host.remove();
    },
  };
}
