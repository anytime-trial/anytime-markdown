/**
 * vanilla 版 StackedReferenceLines
 * (`components/analytics/charts/shared/StackedReferenceLines.tsx` の素 DOM 等価)。
 *
 * ResizeObserver で幅を取得し、SVG 参照線（コミット＝緑・エラー＝赤）を
 * position:absolute のオーバーレイとして描画する。
 */
import type { VanillaViewHandle } from '../../../../shared/vanillaIsland';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LABEL_W = 60;
const PAD_R = 60;

export interface StackedReferenceLinesProps {
  commitTurns: readonly number[];
  errorTurns: readonly number[];
  totalTurns: number;
}

export function mountStackedReferenceLines(
  container: HTMLElement,
  initial: StackedReferenceLinesProps,
): VanillaViewHandle<StackedReferenceLinesProps> {
  let props = initial;
  let width = 0;

  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;top:16px;left:0;width:100%;height:calc(100% - 32px);pointer-events:none;';
  container.appendChild(root);

  let svg: SVGSVGElement | null = null;

  function turnX(turn: number, plotW: number): number {
    return LABEL_W + (turn - 0.5) * plotW;
  }

  function render(): void {
    if (width <= 0 || props.totalTurns <= 0) {
      svg?.remove();
      svg = null;
      return;
    }
    const plotW = Math.max(width - LABEL_W - PAD_R, 0);
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.display = 'block';
      root.appendChild(svg);
    }
    // Clear and rebuild lines
    svg.replaceChildren();
    for (const turn of props.commitTurns) {
      const x = turnX(turn, plotW);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', '100%');
      line.setAttribute('stroke', '#4CAF50');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4 2');
      svg.appendChild(line);
    }
    for (const turn of props.errorTurns) {
      const x = turnX(turn, plotW);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', '100%');
      line.setAttribute('stroke', '#F44336');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '4 2');
      svg.appendChild(line);
    }
  }

  const obs = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    if (w !== width) {
      width = w;
      render();
    }
  });
  obs.observe(root);

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      obs.disconnect();
      root.remove();
    },
  };
}
