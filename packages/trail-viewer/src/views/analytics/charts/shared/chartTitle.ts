/**
 * vanilla 版 ChartTitle（`components/analytics/charts/shared/ChartTitle.tsx` の素 DOM 等価）。
 * title テキスト + 任意の description ツールチップ付きヘルプアイコンを横並びで表示する。
 */
import { createText, createTooltip, HelpOutline } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

export interface ChartTitleProps {
  title: string;
  description?: string;
}

export function mountChartTitle(
  container: HTMLElement,
  initial: ChartTitleProps,
): VanillaViewHandle<ChartTitleProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;align-items:center;padding:0 12px;gap:4px;';
  container.appendChild(root);

  const titleHandle = createText({
    variant: 'subtitle2',
    children: props.title,
  });
  root.appendChild(titleHandle.el);

  // Help icon + tooltip (only shown when description is set)
  let iconEl: SVGSVGElement | null = null;
  let tooltipDestroy: (() => void) | null = null;

  function renderTooltip(): void {
    if (props.description) {
      if (!iconEl) {
        const { el: ic } = HelpOutline({ fontSize: 'small' });
        // Wrap in a span so createTooltip gets an HTMLElement reference
        const wrapper = document.createElement('span');
        wrapper.style.cssText = 'cursor:help;flex-shrink:0;color:var(--am-color-text-disabled);display:inline-flex;font-size:12px;';
        wrapper.appendChild(ic);
        const { destroy } = createTooltip({
          reference: wrapper,
          title: props.description ?? '',
          placement: 'top',
        });
        iconEl = ic;
        tooltipDestroy = destroy;
        root.appendChild(wrapper);
      }
    } else if (iconEl) {
      tooltipDestroy?.();
      iconEl.parentElement?.remove();
      iconEl = null;
      tooltipDestroy = null;
    }
  }

  renderTooltip();

  return {
    update(next) {
      const prev = props;
      props = next;
      if (next.title !== prev.title) {
        titleHandle.update({ children: next.title });
      }
      if (next.description !== prev.description) {
        renderTooltip();
      }
    },
    destroy() {
      tooltipDestroy?.();
      root.remove();
    },
  };
}
