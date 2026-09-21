/**
 * ミニマップ。**図の全体を縮めて枠の左上に浮かせ、囲んだ範囲へ寄せる。**
 *
 * 見え方の操作（拡大・縮小・全体表示・初期表示）もこの中へ入れる（`controls` の場所へ差す）。
 * 全体の絵とその倍率を変える口は同じことを別の言い方で扱っているので、離して置くと、いまどこを
 * 見ているかを確かめてから拡大するのに視線が枠の端どうしを往復する。
 *
 * 絵は **SVG の `viewBox` に図の座標をそのまま渡す**。自前で座標を掛け算して縮めると、押した点を
 * 図の座標へ戻すのに同じ計算の逆を書くことになり、2 つがずれた日に「囲んだ場所と違うところへ
 * 飛ぶ」という直しにくい破れになる。
 *
 * 札は**数に合わせて貸し借りする**（毎回作り直すと、図を動かしている間じゅう要素が入れ替わる）。
 */

import {
  type ChartNode,
  type ChartRect,
  type ChartView,
  type DiagramSpacing,
  minimapBox,
  visibleRect,
} from '@anytime-markdown/diagram-core';

import type { DiagramT } from '../i18n';
import { el, setAttr, svg } from './dom';

/** ミニマップに許す最大の大きさ（px）。図の形に合わせてこの中へ収める。 */
const MAP_MAX = { width: 180, height: 120 };

/**
 * 囲んだと見なす最小の差（ミニマップ上の px）。
 *
 * これより小さい動きは「囲んだ」ではなく「叩いた」として扱い、倍率を変えずに中心だけ移す。
 * 置かないと、軽く叩いただけの操作が数 px の矩形になり、図が最大倍率まで跳ね上がる。
 */
const DRAG_MIN_PX = 6;

export interface MinimapCallbacks {
  /** 囲んだ範囲（図の座標）へ寄せる。幅・高さが 0 なら倍率は変えずに中心だけ移す。 */
  onFocusRect(rect: ChartRect): void;
}

export interface MinimapState {
  readonly nodes: readonly ChartNode[];
  readonly spacing: DiagramSpacing;
  /** 図の線をすべて 1 本にまとめた経路。**まとめて 1 つの要素で描く**（本数ぶんの要素を持たない）。 */
  readonly lines: string;
  readonly surface: { readonly width: number; readonly height: number };
  readonly view: ChartView;
  readonly frame: { readonly width: number; readonly height: number };
}

export interface MinimapView {
  readonly root: HTMLElement;
  /** 見え方の操作を差す場所。持ち主（`mountDiagramViewer`）が中身を入れる。 */
  readonly controls: HTMLElement;
  update(state: MinimapState): void;
}

export function createMinimapView(doc: Document, t: DiagramT, callbacks: MinimapCallbacks): MinimapView {
  const root = el(doc, 'div', { className: 'anytime-diagram-minimap', attrs: { role: 'group' } });
  const map = svg(doc, 'svg', { class: 'anytime-diagram-minimap-map', role: 'img' });
  const linesPath = svg(doc, 'path', { class: 'minimap-lines' });
  const boxes = svg(doc, 'g', { class: 'minimap-nodes' });
  /** いま見えている範囲。**図の座標で描く**（ミニマップ全体が図の座標なので変換が要らない）。 */
  const frameRect = svg(doc, 'rect', { class: 'minimap-view' });
  /** 囲んでいる最中の矩形。掴んでいない間は消す。 */
  const band = svg(doc, 'rect', { class: 'minimap-band anytime-diagram-hidden' });
  map.append(linesPath, boxes, frameRect, band);
  const controls = el(doc, 'div', { className: 'anytime-diagram-minimap-controls' });
  root.append(map, controls);

  /** 貸し出し中の札。図の人物の数に合わせて増減する。 */
  const rects: SVGRectElement[] = [];
  /** 図の座標と画面の座標を結ぶ倍率。押した点を図へ戻すのに要るので、描いた値を覚えておく。 */
  let mapScale = 1;
  /** 囲んでいる最中の始点（図の座標）と、ミニマップ上で動いた量。 */
  let drag: { readonly pointerId: number; readonly x: number; readonly y: number } | null = null;

  /** 押した点を図の座標へ。ミニマップは図と同じ形に縮めてあるので、倍率 1 つで戻せる。 */
  const pointOf = (event: PointerEvent): { readonly x: number; readonly y: number } => {
    const box = map.getBoundingClientRect();
    return { x: (event.clientX - box.left) / mapScale, y: (event.clientY - box.top) / mapScale };
  };

  const applyBand = (rect: ChartRect): void => {
    setAttr(band, 'x', String(rect.x));
    setAttr(band, 'y', String(rect.y));
    setAttr(band, 'width', String(rect.width));
    setAttr(band, 'height', String(rect.height));
    band.classList.remove('anytime-diagram-hidden');
  };

  const endDrag = (): void => {
    drag = null;
    band.classList.add('anytime-diagram-hidden');
  };

  map.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    // 押下を親へ渡さない。渡すと、囲もうとした指が図そのものを平行移動させる。
    event.preventDefault();
    event.stopPropagation();
    map.setPointerCapture(event.pointerId);
    const point = pointOf(event);
    drag = { pointerId: event.pointerId, ...point };
    applyBand({ ...point, width: 0, height: 0 });
  });
  map.addEventListener('pointermove', (event) => {
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    applyBand(rectBetween(drag, pointOf(event)));
  });
  map.addEventListener('pointerup', (event) => {
    const started = drag;
    if (started === null || started.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    const point = pointOf(event);
    const rect = rectBetween(started, point);
    endDrag();
    /*
      小さすぎる囲みは「叩いた」として扱い、**幅も高さも 0 の矩形**を渡す（倍率は変えずに
      中心だけ移る）。閾値はミニマップ上の px で測る — 図の座標で測ると、大きな図ほど
      同じ指の動きが大きな矩形になり、閾値が図の大きさで変わる。
    */
    const tiny = rect.width * mapScale < DRAG_MIN_PX && rect.height * mapScale < DRAG_MIN_PX;
    callbacks.onFocusRect(tiny ? { x: point.x, y: point.y, width: 0, height: 0 } : rect);
  });
  map.addEventListener('pointercancel', endDrag);

  return {
    root,
    controls,
    update(state) {
      root.setAttribute('aria-label', t('minimap'));
      map.setAttribute('aria-label', t('minimapHint'));
      const box = minimapBox(state.surface, MAP_MAX);
      mapScale = box.scale;
      map.setAttribute('width', String(Math.round(box.width)));
      map.setAttribute('height', String(Math.round(box.height)));
      map.setAttribute('viewBox', `0 0 ${Math.max(state.surface.width, 1)} ${Math.max(state.surface.height, 1)}`);
      setAttr(linesPath, 'd', state.lines === '' ? null : state.lines);

      while (rects.length < state.nodes.length) {
        const rect = svg(doc, 'rect');
        rects.push(rect);
        boxes.appendChild(rect);
      }
      while (rects.length > state.nodes.length) rects.pop()!.remove();
      for (const [index, node] of state.nodes.entries()) {
        const rect = rects[index]!;
        rect.setAttribute('x', String(node.x));
        rect.setAttribute('y', String(node.y));
        rect.setAttribute('width', String(state.spacing.nodeWidth));
        rect.setAttribute('height', String(state.spacing.nodeHeight));
      }

      const seen = visibleRect(state.view, state.frame);
      frameRect.setAttribute('x', String(seen.x));
      frameRect.setAttribute('y', String(seen.y));
      frameRect.setAttribute('width', String(Math.max(seen.width, 0)));
      frameRect.setAttribute('height', String(Math.max(seen.height, 0)));
    },
  };
}

/** 2 点から矩形を作る。どちらの向きへ囲んでも同じ矩形になるよう、必ず正の幅・高さにする。 */
function rectBetween(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): ChartRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}
