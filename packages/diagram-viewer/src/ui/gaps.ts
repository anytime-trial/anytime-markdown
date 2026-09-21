/**
 * 要素どうしの**すき間を掴んで変える取っ手**。図の面の上、最初のすき間の帯に置く。
 *
 * 帯（スライダー）を画面の外に置かない。すき間は「箱と箱の間の空き」という**図の上の場所**を
 * 持つ量なので、変える操作もその場所に置く（箱の大きさの取っ手を箱の縁へ置いたのと同じ理由）。
 *
 * 取っ手は最初のすき間に置く。2 つ目以降を掴ませると、手前のすき間も一緒に広がるぶん取っ手が
 * 指より速く動く（箱の大きさの取っ手が列 + 1 倍で動くのと同じ理屈）。
 */

import {
  DIAGRAM_SPACING_RANGE,
  type DiagramSpacing,
  gapBand,
  type GapAxis,
  type GridExtent,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el, setAttr, setClass } from './dom';

export interface GapCallbacks {
  onGapPointerDown(event: PointerEvent, axis: GapAxis): void;
  onGapPointerMove(event: PointerEvent): void;
  onGapPointerUp(event: PointerEvent): void;
  /** キーボードから増減する。1 回の刻みは呼ばれた側が決める。 */
  onGapKey(event: KeyboardEvent, axis: GapAxis): void;
}

export interface GapState {
  readonly spacing: DiagramSpacing;
  /** 図の広がり。すき間が 1 つも無い図（1 列・1 行）では取っ手を出さない。 */
  readonly extent: GridExtent;
  /** 図の面の大きさ。取っ手の長さをここから決める。 */
  readonly surface: { readonly width: number; readonly height: number };
  readonly editing: boolean;
  readonly saving: boolean;
}

export interface GapView {
  readonly root: HTMLDivElement;
  update(state: GapState): void;
}

/** 矢印キー 1 回で動かす px。Shift を添えると粗く動く（札の移動と同じ約束）。 */
const STEP = 4;
const COARSE_STEP = 24;

export function nudgeStep(event: KeyboardEvent, axis: GapAxis): number | null {
  const step = event.shiftKey ? COARSE_STEP : STEP;
  const by: Readonly<Record<string, number>> = axis === 'column'
    ? { ArrowLeft: -step, ArrowRight: step }
    : { ArrowUp: -step, ArrowDown: step };
  return by[event.key] ?? null;
}

export function createGapView(doc: Document, t: DiagramT, callbacks: GapCallbacks): GapView {
  const root = el(doc, 'div', { className: 'anytime-diagram-gaps' });
  const handles = (['column', 'row'] as const).map((axis) => {
    /*
      値ごと伝える `role="slider"` にする。名前だけのボタンにすると、目で画面を追えない利用者には
      操作が効いているかどうかも届かない（箱の大きさの取っ手と同じ扱い）。
    */
    const button = el(doc, 'button', {
      className: `anytime-diagram-gap is-${axis}`,
      attrs: {
        type: 'button',
        role: 'slider',
        'aria-valuemin': String(DIAGRAM_SPACING_RANGE[axis === 'column' ? 'columnGap' : 'rowGap'].min),
        'aria-valuemax': String(DIAGRAM_SPACING_RANGE[axis === 'column' ? 'columnGap' : 'rowGap'].max),
      },
    });
    button.addEventListener('pointerdown', (event) => {
      // 押下を親へ渡さない。渡すと、すき間を掴んだはずの指が図を平行移動させる。
      event.stopPropagation();
      callbacks.onGapPointerDown(event, axis);
    });
    button.addEventListener('pointermove', callbacks.onGapPointerMove);
    button.addEventListener('pointerup', callbacks.onGapPointerUp);
    button.addEventListener('pointercancel', callbacks.onGapPointerUp);
    button.addEventListener('keydown', (event) => callbacks.onGapKey(event, axis));
    root.appendChild(button);
    return { axis, button };
  });

  return {
    root,
    update(state) {
      setClass(root, 'anytime-diagram-hidden', !state.editing);
      for (const { axis, button } of handles) {
        const band = gapBand(state.spacing, axis);
        const value = axis === 'column' ? state.spacing.columnGap : state.spacing.rowGap;
        // すき間が 1 つも無い図（列が 1 本・行が 1 本）では掴む場所が無い。隠して理由を残す。
        const available = axis === 'column' ? state.extent.columns > 1 : state.extent.rows > 1;
        setClass(button, 'anytime-diagram-hidden', !available);
        if (axis === 'column') {
          button.style.left = `${band.start}px`;
          button.style.width = `${band.size}px`;
          button.style.height = `${state.surface.height}px`;
        } else {
          button.style.top = `${band.start}px`;
          button.style.height = `${band.size}px`;
          button.style.width = `${state.surface.width}px`;
        }
        button.disabled = state.saving;
        const text = t(axis === 'column' ? 'columnGap' : 'rowGap', { value });
        button.setAttribute('aria-label', text);
        button.title = text;
        setAttr(button, 'aria-valuenow', String(value));
        setAttr(button, 'aria-valuetext', text);
        setAttr(button, 'aria-orientation', axis === 'column' ? 'horizontal' : 'vertical');
      }
    },
  };
}
