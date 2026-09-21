/**
 * 人物の箱。図に居る人物 1 人につき 1 つ作り、**作り直さずに更新する**。
 *
 * ドラッグは指を動かすたびに走る。毎フレーム作り直すと、掴んでいる要素そのものが入れ替わって
 * ポインタの捕捉（`setPointerCapture`）が外れ、指が箱から離れる。
 */

import {
  DIAGRAM_SPACING_RANGE,
  type ChartNode,
  type DiagramDocument,
  type DiagramSpacing,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { groupLabelsOf, parentsOf } from '../model';
import { el, setAttr, setClass } from './dom';

/** どの辺を掴んだか。取っ手ごとに固定なので、毎回作り直さず 1 つを配る。 */
export const WIDTH_AXES = Object.freeze({ width: true, height: false });
export const HEIGHT_AXES = Object.freeze({ width: false, height: true });
export const BOTH_AXES = Object.freeze({ width: true, height: true });

export type ResizeAxes = typeof WIDTH_AXES | typeof HEIGHT_AXES | typeof BOTH_AXES;

export interface NodeCallbacks {
  onNodePointerDown(event: PointerEvent, name: string): void;
  onNodePointerMove(event: PointerEvent): void;
  onNodePointerUp(event: PointerEvent): void;
  onTogglePick(name: string): void;
  onNudge(name: string, columns: number, rows: number): void;
  onRelease(name: string): void;
  onSizePointerDown(event: PointerEvent, name: string, axes: ResizeAxes): void;
  onSizePointerMove(event: PointerEvent): void;
  onSizePointerUp(event: PointerEvent): void;
  onResizeKey(event: KeyboardEvent, axes: ResizeAxes): void;
}

export interface NodeViewState {
  readonly node: ChartNode;
  readonly spacing: DiagramSpacing;
  readonly editing: boolean;
  readonly picked: boolean;
  readonly dimmed: boolean;
  readonly moved: boolean;
  readonly isAnchor: boolean;
  readonly saving: boolean;
}

export interface NodeView {
  readonly root: HTMLDivElement;
  update(state: NodeViewState): void;
}

/** キーボードで 1 回動かす升目の数。Shift を添えると粗く動く。 */
const NUDGE_CELLS = 1;
const COARSE_NUDGE_CELLS = 5;

export function createNodeView(
  doc: Document,
  document_: DiagramDocument,
  name: string,
  t: DiagramT,
  callbacks: NodeCallbacks,
): NodeView {
  const root = el(doc, 'div', { className: 'anytime-diagram-node', attrs: { 'data-person': name } });
  root.appendChild(el(doc, 'strong', { text: name }));

  const labels = groupLabelsOf(document_, name);
  const group = el(doc, 'span', { text: labels[0] ?? '' });
  if (labels.length > 0) group.title = labels.join(' / ');
  root.appendChild(group);

  const parents = parentsOf(document_, name);
  if (parents.length > 0) {
    root.appendChild(el(doc, 'span', {
      className: 'anytime-diagram-visually-hidden',
      text: `${t('parentLabel')}: ${parents.join('・')}`,
    }));
  }

  const annotation = document_.annotations[name];
  if (annotation !== undefined) root.appendChild(el(doc, 'small', { text: annotation }));

  // 取っ手は常に作り、編集していない間はクラスで隠す。作り直すと、押している最中に
  // 要素が入れ替わってキーボードの焦点が図の外へ飛ぶ。
  const handle = el(doc, 'span', { className: 'anytime-diagram-handle anytime-diagram-hidden' });
  const pick = el(doc, 'button', {
    className: 'anytime-diagram-pick',
    text: '☐',
    attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `${t('pickPerson')}: ${name}` },
  });
  pick.addEventListener('click', () => callbacks.onTogglePick(name));
  const move = el(doc, 'button', {
    text: '⤧',
    attrs: { type: 'button', 'aria-label': `${t('movePerson')}: ${name}` },
  });
  move.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? COARSE_NUDGE_CELLS : NUDGE_CELLS;
    const by: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const delta = by[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    callbacks.onNudge(name, delta[0], delta[1]);
  });
  const release = el(doc, 'button', {
    className: 'anytime-diagram-hidden',
    text: '⟲',
    attrs: { type: 'button', 'aria-label': `${t('releasePerson')}: ${name}` },
  });
  release.addEventListener('click', () => callbacks.onRelease(name));
  handle.append(pick, move, release);
  root.appendChild(handle);

  const sizeHandles = ([
    ['is-width', WIDTH_AXES, t('resizeWidth'), 'nodeWidth'],
    ['is-height', HEIGHT_AXES, t('resizeHeight'), 'nodeHeight'],
    ['is-both', BOTH_AXES, t('resizeBoth'), null],
  ] as const).map(([variant, axes, label, sliderKey]) => {
    const button = el(doc, 'button', {
      className: `anytime-diagram-size ${variant} anytime-diagram-hidden`,
      attrs: { type: 'button', 'aria-label': label, title: label },
    });
    // 1 軸の取っ手は role="slider" で値ごと伝える。名前だけのボタンにすると、目で画面を
    // 追えない利用者には操作が効いているかどうかも届かない。右下（2 軸）は slider に
    // 当てはまらないので、値は選択の区画の output が知らせる。
    if (sliderKey !== null) {
      button.setAttribute('role', 'slider');
      button.setAttribute('aria-valuemin', String(DIAGRAM_SPACING_RANGE[sliderKey].min));
      button.setAttribute('aria-valuemax', String(DIAGRAM_SPACING_RANGE[sliderKey].max));
    }
    button.addEventListener('pointerdown', (event) => callbacks.onSizePointerDown(event, name, axes));
    button.addEventListener('pointermove', callbacks.onSizePointerMove);
    button.addEventListener('pointerup', callbacks.onSizePointerUp);
    button.addEventListener('pointercancel', callbacks.onSizePointerUp);
    button.addEventListener('keydown', (event) => callbacks.onResizeKey(event, axes));
    root.appendChild(button);
    return { button, sliderKey };
  });

  root.addEventListener('pointerdown', (event) => callbacks.onNodePointerDown(event, name));
  root.addEventListener('pointermove', callbacks.onNodePointerMove);
  root.addEventListener('pointerup', callbacks.onNodePointerUp);
  root.addEventListener('pointercancel', callbacks.onNodePointerUp);

  return {
    root,
    update(state) {
      const { node, spacing } = state;
      root.style.left = `${node.x}px`;
      root.style.top = `${node.y}px`;
      root.style.width = `${spacing.nodeWidth}px`;
      root.style.height = `${spacing.nodeHeight}px`;
      setClass(root, 'is-selected', state.picked);
      setClass(root, 'is-node-dimmed', state.dimmed);
      setClass(root, 'is-moved', state.moved);
      setClass(handle, 'anytime-diagram-hidden', !state.editing);
      pick.setAttribute('aria-pressed', String(state.picked));
      pick.textContent = state.picked ? '☑' : '☐';
      setClass(release, 'anytime-diagram-hidden', !state.moved);
      for (const { button, sliderKey } of sizeHandles) {
        setClass(button, 'anytime-diagram-hidden', !(state.editing && state.isAnchor));
        button.disabled = state.saving;
        if (sliderKey !== null) {
          button.setAttribute('aria-valuenow', String(spacing[sliderKey]));
          setAttr(button, 'aria-valuetext', t('cardSize', { width: spacing.nodeWidth, height: spacing.nodeHeight }));
        }
      }
    },
  };
}
