/**
 * 関係線（親子・生成・婚姻）と、線の上に置く節点。
 *
 * 家族 1 件につき 1 つの `<g>` を作り、**作り直さずに `d` を書き換える**。線は人物の数より
 * 多くなりうるので、ドラッグのたびに作り直すと図が指に追随しない。
 */

import { arrowHeadPath, type ConnectorPointAt, DIAGRAM_LINE_COLORS, type DiagramFamily } from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import type { FamilyConnector } from '../model';
import { additiveFrom, setAttr, setClass, svg } from './dom';

export interface EdgeCallbacks {
  /** 線を押したとき。押したら選ぶ（外すのは図の地を押したとき）。 */
  onSelectFamily(index: number, additive: boolean): void;
}

export interface EdgeViewState {
  readonly connector: FamilyConnector;
  /** 図の倍率。端の印の画面上の大きさを保つのに要る（線の太さと同じ扱い）。 */
  readonly scale: number;
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
      callbacks.onSelectFamily(index, additiveFrom(event));
    });
    path.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.onSelectFamily(index, additiveFrom(event));
    });
  }
  /*
    二重線の芯。手で引いた線と同じ手（太い線の上へ地の色で細い線を重ねる）で描く。
    当たり判定と焦点は元の 2 本が持つので、芯は絵だけ（`pointer-events` も `tabindex` も持たない）。
  */
  const marriageCore = svg(doc, 'path', { class: 'edge-core' });
  const descentCore = svg(doc, 'path', { class: 'edge-core' });
  root.append(marriage, descent, marriageCore, descentCore);
  const points: SVGCircleElement[] = [];
  /** 端の印。子の数で増減するので、節点と同じく足りなければ作り、余ったら消す。 */
  const caps: SVGElement[] = [];

  return {
    root,
    update({ connector, scale, selected, dimmed }) {
      setClass(root, 'is-line-selected', selected);
      setClass(root, 'is-line-dimmed', dimmed);
      /*
        見た目の上書きがある家族は、種別で決まる装い（親子は実線・生成は点線…）を**丸ごと**
        置き換える。片方だけ残すと、色を変えただけの線が種別の破線を保ったままになり、
        設定の区画に出ている値と図が食い違う。
      */
      const look = connector.look;
      setClass(root, 'is-look-set', connector.family.look !== undefined);
      setClass(root, 'is-dashed', look.line === 'dashed');
      setClass(root, 'is-double', look.line === 'double');
      for (const name of DIAGRAM_LINE_COLORS) setClass(root, `is-color-${name}`, look.color === name);
      syncCaps(doc, root, caps, connector, scale);
      // `d` が無い path はタブ順に残る一方で何も描かない（押せない操作要素になる）ので、
      // 線を持たない家族では要素ごと隠す。
      applyPath(marriage, connector.marriage);
      applyPath(descent, connector.descent);
      // 芯は同じ経路をなぞる。焦点の巡回には入れない（`tabindex` を付けない）。
      setAttr(marriageCore, 'd', connector.marriage);
      setAttr(descentCore, 'd', connector.descent);
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

/** 端の印の画面上の大きさ（px）。手で引いた線と同じ値にする（`ui/connectors.ts`）。 */
const CAP_PX = 9;

/**
 * 端の印を当てる。親側は結び目に 1 つ、子側は**子ごとに 1 つ**。
 *
 * 形（矢印は `path`、丸は `circle`）が混ざるので、要素は毎回作り直さず**必要な数だけ確保して
 * 置き換える**。数が変わるのは子を足し引きしたときだけで、指の動きでは変わらない。
 */
function syncCaps(
  doc: Document,
  root: SVGGElement,
  caps: SVGElement[],
  connector: FamilyConnector,
  scale: number,
): void {
  const { look } = connector;
  const wanted: { readonly kind: 'circle' | 'arrow'; readonly at: ConnectorPointAt }[] = [];
  if (look.start !== 'none' && connector.caps.start !== null) {
    wanted.push({ kind: look.start, at: connector.caps.start });
  }
  if (look.end !== 'none') {
    for (const at of connector.caps.ends) wanted.push({ kind: look.end, at });
  }
  while (caps.length > wanted.length) caps.pop()!.remove();
  const size = CAP_PX / Math.max(scale, 0.01);
  for (const [index, { kind, at }] of wanted.entries()) {
    const existing = caps[index];
    const tag = kind === 'arrow' ? 'path' : 'circle';
    // 形が変わったら作り直す（`path` を `circle` へは書き換えられない）。
    const element = existing !== undefined && existing.tagName === tag
      ? existing
      : replaceCap(doc, root, caps, index, tag);
    if (kind === 'arrow') setAttr(element, 'd', arrowHeadPath(at, at.angle, size));
    else {
      element.setAttribute('cx', String(at.x));
      element.setAttribute('cy', String(at.y));
      element.setAttribute('r', String(size / 2.4));
    }
  }
}

function replaceCap(
  doc: Document,
  root: SVGGElement,
  caps: SVGElement[],
  index: number,
  tag: 'path' | 'circle',
): SVGElement {
  caps[index]?.remove();
  const element = svg(doc, tag, { class: 'edge-cap' });
  caps[index] = element;
  root.appendChild(element);
  return element;
}
