import { injectGraphUiStyles } from '../ui/injectStyles';

export interface TooltipHandle {
  destroy(): void;
}

/**
 * MUI Tooltip の vanilla 置換。target 要素への hover / focus で上方にツールチップを表示する。
 * destroy() でイベントリスナーを解除し、表示中のツールチップも除去する。
 */
export function createTooltip(target: HTMLElement, title: string): TooltipHandle {
  injectGraphUiStyles();

  let tooltipEl: HTMLDivElement | null = null;

  function show(): void {
    if (!title || typeof document === 'undefined') return;
    const r = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'gv-tooltip';
    el.setAttribute('role', 'tooltip');
    el.textContent = title;
    el.style.top = `${r.top - 6}px`;
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.transform = 'translate(-50%, -100%)';
    document.body.appendChild(el);
    tooltipEl = el;
  }

  function hide(): void {
    tooltipEl?.remove();
    tooltipEl = null;
  }

  target.addEventListener('mouseenter', show);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('focusin', show);
  target.addEventListener('focusout', hide);

  function destroy(): void {
    hide();
    target.removeEventListener('mouseenter', show);
    target.removeEventListener('mouseleave', hide);
    target.removeEventListener('focusin', show);
    target.removeEventListener('focusout', hide);
  }

  return { destroy };
}
