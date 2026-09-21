/**
 * 手で引いた接続線。1 本につき 1 つの `<g>` を作り、**作り直さずに属性を書き換える**。
 *
 * 家族の関係線（`edges.ts`）と層を分けてある。あちらは家族の形から機械的に引かれ、押すと
 * 家族が選ばれる。こちらは人が引いた線そのもので、押すと**その線**が選ばれ、線種と端の印を
 * 変えられる。同じ層に混ぜると、押した線が「編集できる線」なのかどうかが見た目で分からない。
 *
 * 端の印（●・矢印）は**図の座標で描き、大きさを倍率で割る**。線の太さと同じ扱いにするため
 * （全体表示で端の印だけ消えると、線の向きの情報がまるごと落ちる）。SVG の `marker` を使わない
 * のは、`marker` の塗りに参照元の線の色を引き継ぐ手段（`context-stroke`）が宿主の版で当てに
 * ならず、暗い背景で黒い矢尻になりうるため。
 */

import { arrowHeadPath, type ConnectorPointAt, DIAGRAM_LINE_COLORS } from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import type { DiagramLink } from '../model';
import { setAttr, setClass, svg } from './dom';

/** 端の印の画面上の大きさ（px）。線の太さと同じく倍率から切り離す。 */
const CAP_PX = 9;

export interface LinkCallbacks {
  /** 線を押したとき。押したら選ぶ（外すのは図の地を押したとき）。 */
  onSelectLink(id: string): void;
}

export interface LinkViewState {
  readonly link: DiagramLink;
  /**
   * 読み上げに出すこの線の呼び名。**呼び名は外から渡す。**
   *
   * 端は要素名だけでなく「別の線の中点」も指すので、呼び名を出すには図の全体が要る。ここで
   * 組み立てると、線 1 本の部品が図の全体を知る必要が出る。
   */
  readonly label: string;
  readonly scale: number;
  readonly selected: boolean;
  readonly dimmed: boolean;
}

export interface LinkView {
  readonly root: SVGGElement;
  readonly id: string;
  update(state: LinkViewState): void;
}

export function createLinkView(
  doc: Document,
  id: string,
  t: DiagramT,
  callbacks: LinkCallbacks,
): LinkView {
  const root = svg(doc, 'g', { 'data-connector': id });
  // 当たり判定だけの太い線を先に敷く。見える線は画面上 1.8px で、狙って押すには細すぎる
  // （WCAG 2.2 の対象の大きさ）。透明なので見た目は変わらない。
  const hit = svg(doc, 'path', { class: 'link-hit', tabindex: '0', role: 'button' });
  const line = svg(doc, 'path', { class: 'link-line' });
  const caps = {
    start: { arrow: svg(doc, 'path', { class: 'link-cap' }), circle: svg(doc, 'circle', { class: 'link-cap' }) },
    end: { arrow: svg(doc, 'path', { class: 'link-cap' }), circle: svg(doc, 'circle', { class: 'link-cap' }) },
  };
  root.append(hit, line, caps.start.arrow, caps.start.circle, caps.end.arrow, caps.end.circle);

  const select = (event: Event): void => {
    event.stopPropagation();
    callbacks.onSelectLink(id);
  };
  hit.addEventListener('click', select);
  hit.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    select(event);
  });

  return {
    root,
    id,
    update({ link, label, scale, selected, dimmed }) {
      const { connector, geometry } = link;
      setClass(root, 'is-line-selected', selected);
      // 色は役割の名前をクラスへ写す（実際の色はスタイルシートが宿主のトークンから引く）。
      for (const name of DIAGRAM_LINE_COLORS) setClass(root, `is-color-${name}`, connector.color === name);
      setClass(root, 'is-line-dimmed', dimmed);
      setAttr(hit, 'd', geometry.path);
      setAttr(line, 'd', geometry.path);
      setClass(line, 'is-dashed', connector.line === 'dashed');
      hit.setAttribute('aria-label', label);
      // 端の印は画面上の大きさを保つ。図の座標では倍率で割った長さになる。
      const size = CAP_PX / Math.max(scale, 0.01);
      applyCap(caps.start, connector.start, geometry.start, size);
      applyCap(caps.end, connector.end, geometry.end, size);
    },
  };
}

type CapElements = { readonly arrow: SVGPathElement; readonly circle: SVGCircleElement };

/**
 * 端の印を当てる。**使わないほうは隠すだけで消さない。**
 *
 * 形を変えるたびに要素を作り直すと、選んだ線の焦点がその場で外れる（選択の帯で形を選んでいる
 * 最中に、選び直しへ戻される）。
 */
function applyCap(
  elements: CapElements,
  kind: 'none' | 'circle' | 'arrow',
  point: ConnectorPointAt,
  size: number,
): void {
  setClass(elements.arrow, 'anytime-diagram-hidden', kind !== 'arrow');
  setClass(elements.circle, 'anytime-diagram-hidden', kind !== 'circle');
  if (kind === 'arrow') setAttr(elements.arrow, 'd', arrowHeadPath(point, point.angle, size));
  if (kind === 'circle') {
    elements.circle.setAttribute('cx', String(point.x));
    elements.circle.setAttribute('cy', String(point.y));
    elements.circle.setAttribute('r', String(size / 2.4));
  }
}
