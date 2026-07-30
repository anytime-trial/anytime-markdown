import type { CanvasSize, ScreenPoint, ViewportState } from '../types';
import { fitBounds, screenToWorld, worldToScreen, zoomAt, type Bounds } from '../viewport/viewport';

/** ミニマップの内側に確保する余白（CSS ピクセル）。 */
const MINIMAP_PADDING = 6;

/** ミニマップ上の矩形（CSS ピクセル）。 */
export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ミニマップ自身の視野。表示対象の全体が収まる倍率と位置を返す。
 *
 * 図の視野（{@link ViewportState}）と同じ型で表すため、world 座標の変換は
 * `worldToScreen` / `screenToWorld` をそのまま使える。ミニマップ専用の座標変換を
 * 別に作ると、図側の変換と定義がずれても誰も気づけない。
 */
export function minimapViewport(bounds: Bounds | null, size: CanvasSize): ViewportState {
  return fitBounds(bounds, size, MINIMAP_PADDING);
}

/**
 * 図で今見えている範囲を、ミニマップ上の矩形に直す。
 *
 * 図の canvas の 4 隅を world 座標へ戻し、ミニマップの視野で描き直す。倍率と位置の
 * 両方が効くため、拡大すれば矩形は小さく、移動すれば同じ向きへ動く。
 */
export function visibleRect(main: ViewportState, mainSize: CanvasSize, mini: ViewportState): MinimapRect {
  const topLeft = worldToScreen(screenToWorld({ x: 0, y: 0 }, main), mini);
  const bottomRight = worldToScreen(
    screenToWorld({ x: mainSize.width, y: mainSize.height }, main),
    mini,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/**
 * ミニマップ上で指した位置を、図の中心へ持ってくる視野を返す。
 *
 * 倍率は変えない。位置合わせで拡大率まで動かすと、同じ場所を押すたびに見え方が変わる。
 */
export function centerOnMinimapPoint(
  main: ViewportState,
  mainSize: CanvasSize,
  point: ScreenPoint,
  mini: ViewportState,
): ViewportState {
  const world = screenToWorld(point, mini);
  return {
    scale: main.scale,
    offsetX: mainSize.width / 2 - world.x * main.scale,
    offsetY: mainSize.height / 2 - world.y * main.scale,
  };
}

/**
 * ミニマップ上で一定量ぶん表示位置をずらす。キーボード操作の入口。
 *
 * 今の中心をミニマップ上の点に直し、そこから `dx` / `dy` だけ動かした点を中心へ持ってくる。
 * ポインタ操作と同じ {@link centerOnMinimapPoint} を通すため、移動量の意味が両者で揃う。
 */
export function nudgeOnMinimap(
  main: ViewportState,
  mainSize: CanvasSize,
  mini: ViewportState,
  dx: number,
  dy: number,
): ViewportState {
  const centre = screenToWorld({ x: mainSize.width / 2, y: mainSize.height / 2 }, main);
  const onMinimap = worldToScreen(centre, mini);
  return centerOnMinimapPoint(main, mainSize, { x: onMinimap.x + dx, y: onMinimap.y + dy }, mini);
}

/**
 * 図の中心を保ったまま倍率を変える。
 *
 * 倍率の上下限は `zoomAt` が持つものに従う。ここで別の制限を書くと、ホイール操作と
 * ボタン操作で到達できる範囲が食い違う。
 */
export function zoomViewportCenter(viewport: ViewportState, size: CanvasSize, factor: number): ViewportState {
  return zoomAt(viewport, { x: size.width / 2, y: size.height / 2 }, factor);
}
