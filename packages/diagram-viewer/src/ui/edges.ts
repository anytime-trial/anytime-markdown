/**
 * 関係線（親子・生成・婚姻）と、線の上に置く節点。
 *
 * 家族 1 件につき 1 つの `<g>` を作り、**作り直さずに `d` を書き換える**。線は人物の数より
 * 多くなりうるので、ドラッグのたびに作り直すと図が指に追随しない。
 */

import type { DiagramFamily } from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import type { FamilyConnector } from '../model';
import { setAttr, setClass, svg } from './dom';

export interface EdgeCallbacks {
  /** 線を押したとき。同じ家族をもう一度押すと選択が外れる。 */
  onSelectFamily(index: number): void;
}

export interface EdgeViewState {
  readonly connector: FamilyConnector;
  readonly selected: boolean;
  readonly dimmed: boolean;
}

export interface EdgeView {
  readonly root: SVGGElement;
  update(state: EdgeViewState): void;
}

export function createEdgeView(
  doc: Document,
  family: DiagramFamily,
  index: number,
  t: DiagramT,
  callbacks: EdgeCallbacks,
): EdgeView {
  const label = `${t('selectLine')}: ${family.parents.join('・')}`;
  const root = svg(doc, 'g', { 'data-family': family.parents.join('・') });
  const marriage = svg(doc, 'path', {
    class: 'edge-spouse', tabindex: '0', role: 'button', 'aria-label': label,
  });
  const descent = svg(doc, 'path', {
    class: `edge-${family.kind}`, tabindex: '0', role: 'button', 'aria-label': label,
  });
  for (const path of [marriage, descent]) {
    path.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onSelectFamily(index);
    });
    path.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.onSelectFamily(index);
    });
  }
  root.append(marriage, descent);
  const points: SVGCircleElement[] = [];

  return {
    root,
    update({ connector, selected, dimmed }) {
      setClass(root, 'is-line-selected', selected);
      setClass(root, 'is-line-dimmed', dimmed);
      // `d` が無い path はタブ順に残る一方で何も描かない（押せない操作要素になる）ので、
      // 線を持たない家族では要素ごと隠す。
      applyPath(marriage, connector.marriage);
      applyPath(descent, connector.descent);
      syncPoints(doc, root, points, connector.points);
    },
  };
}

function applyPath(path: SVGPathElement, d: string | null): void {
  setAttr(path, 'd', d);
  setClass(path, 'anytime-diagram-hidden', d === null);
  // 隠した線を焦点の巡回から外す。`display: none` でも読み上げの一覧には出ないが、
  // `tabindex` が残ると実装によっては焦点を受け取る。
  setAttr(path, 'tabindex', d === null ? null : '0');
}

/** 節点は家族ごとに数が変わる（子の数）。足りなければ作り、余ったら消す。 */
function syncPoints(
  doc: Document,
  root: SVGGElement,
  points: SVGCircleElement[],
  next: readonly { readonly x: number; readonly y: number; readonly kind: string }[],
): void {
  while (points.length < next.length) {
    const circle = svg(doc, 'circle');
    points.push(circle);
    root.appendChild(circle);
  }
  while (points.length > next.length) points.pop()!.remove();
  for (const [index, point] of next.entries()) {
    const circle = points[index]!;
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', point.kind === 'junction' ? '3.5' : '3');
    circle.setAttribute('class', `point point-${point.kind}`);
  }
}
