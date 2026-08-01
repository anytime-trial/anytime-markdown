import type { CanvasSize, RenderGraph, ThemeMode, ViewportState } from '../types';
import type { CooccurrenceT } from '../i18n/createCooccurrenceT';
import { graphBounds } from '../render/bounds';
import { drawMinimap } from '../render/drawMinimap';
import { updateCanvasSize } from '../render/canvasSize';
import { readCooccurrenceTheme, type CooccurrenceTheme } from '../theme/readTheme';
import { centerOnMinimapPoint, minimapViewport, nudgeOnMinimap, visibleRect } from './minimapModel';
import { createPanelButton, ensureButtonBaseStyles } from './buttonBaseStyle';

/** ボタン 1 回あたりの倍率。canvas 上のキーボード操作（`+` / `-`）と揃える。 */
const ZOOM_STEP = 1.2;
/** 矢印キー 1 回あたりの移動量（ミニマップ上の CSS ピクセル）。 */
const NUDGE_STEP = 8;

/** 描画に必要な、図の側の状態。 */
export interface MinimapFrameState {
  graph: RenderGraph;
  /** 図の視野。 */
  viewport: ViewportState;
  /** 図の canvas の表示サイズ（CSS ピクセル）。 */
  canvasSize: CanvasSize;
  themeMode: ThemeMode;
}

export interface MinimapPanelOptions {
  /** テーマ変数（`--cooc-*`）が載っている要素。 */
  themeHost: HTMLElement;
  t: CooccurrenceT;
  /**
   * 描く直前に図の状態を取りに行く。
   *
   * Why not `update(state)` で押し込むか: 視野は図をドラッグするたびに変わる。
   * 隠れている間も含めて毎回状態を渡すと、描かない値の受け渡しだけが積み上がる。
   * 描く側が必要になった時点で引く（`renderScheduler` と同じ）。
   */
  getState(): MinimapFrameState;
  /** ミニマップ上の操作で決まった図の視野。 */
  onViewportChange(next: ViewportState): void;
  /** 拡大・縮小。中心は図の中央に保つ。 */
  onZoom(factor: number): void;
  onFitContent(): void;
}

export interface MinimapPanelHandle {
  readonly element: HTMLElement;
  /** 言語切替でラベルを引き直す。 */
  setT(t: CooccurrenceT): void;
  /**
   * 再描画を要求する。視野の変更時と、タブが表示へ戻った時に呼ぶ。
   *
   * 隠れている間の canvas は幅も高さも 0 になり、描いても何も残らない。表示に戻った
   * ことを誰も伝えないと全体像が空のままになるため、切り替え時にも要求が要る
   * （語一覧が可視行数を失うのと同じ経路）。
   */
  refresh(): void;
  /**
   * 観測点。実際に描いた回数。
   *
   * 要求時にだけ描く作りは、要求の書き忘れが「画面が更新されない」形でしか現れない。
   * 外から回数を見られないと、その退行をテストで捕まえられない（`renderScheduler` の
   * `getFrameCount()` と同じ役割）。
   */
  getDrawCount(): number;
  destroy(): void;
}

const STYLE_ID = 'cooccurrence-minimap-panel-style';

function ensureStyles(): void {
  ensureButtonBaseStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.cooc-minimap{display:flex;flex-direction:column;flex:1 1 auto;padding:12px;gap:10px}
.cooc-minimap__frame{position:relative;flex:0 0 auto;width:100%;aspect-ratio:3 / 2;min-height:120px;border:1px solid var(--cooc-divider);border-radius:8px;background:var(--cooc-bg);overflow:hidden;box-shadow:0 3px 1px -2px rgba(0,0,0,.20),0 2px 2px 0 rgba(0,0,0,.14),0 1px 5px 0 rgba(0,0,0,.12)}
.cooc-minimap__canvas{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair}
.cooc-minimap__buttons{position:absolute;right:4px;bottom:4px;display:flex;gap:4px}
.cooc-minimap__button{display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;background:var(--cooc-scrim);color:var(--cooc-text);border-radius:4px}
.cooc-minimap__button:hover{background:var(--cooc-action-selected)}
.cooc-minimap__hint{flex:0 0 auto;color:var(--cooc-text-secondary);font:12px system-ui,sans-serif}
`;
  document.head.appendChild(style);
}

/**
 * アイコンの図形。`currentColor` で塗るため、ボタンの文字色をそのまま継ぐ。
 *
 * Why not アイコンフォントや絵文字か: 絵文字は使わない規約であり（design.md §8）、
 * フォントの追加読み込みは webview の CSP と初回表示の待ち時間に効く。
 */
function createIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

/**
 * 図柄は Material Filled（design.md §8）で、C4 のミニマップ（trail-viewer
 * `minimapCanvas.ts`）と同じ図形を使う。同じ製品群の中で同じ操作を別の図柄で描くと、
 * ビューアを移った利用者が図柄を覚え直すことになる。
 */
const ICON_ZOOM_IN =
  'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14m.5-7H9v2H7v1h2v2h1v-2h2V9h-2z';
const ICON_ZOOM_OUT =
  'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14M7 9h5v1H7z';
const ICON_FIT =
  'M17 4h3c1.1 0 2 .9 2 2v2h-2V6h-3zM4 8V6h3V4H4c-1.1 0-2 .9-2 2v2zm16 8v2h-3v2h3c1.1 0 2-.9 2-2v-2zM7 18H4v-2H2v2c0 1.1.9 2 2 2h3zM18 8H6v8h12z';

export function createMinimapPanel(options: MinimapPanelOptions): MinimapPanelHandle {
  ensureStyles();
  let t = options.t;
  let theme: CooccurrenceTheme | null = null;
  let themeModeAtRead: ThemeMode | null = null;
  let scheduled = false;
  let destroyed = false;
  let rafId = 0;
  let dragging = false;
  let drawCount = 0;
  /**
   * 直近に描いたときの寸法。
   *
   * ポインタ位置の変換にも同じ値を使う。描画側と変換側で別々に測ると、CSS の余白が
   * 変わった時に「描かれた全体像」と「押した点の world 座標」が静かにずれる。
   */
  let lastSize: CanvasSize = { width: 0, height: 0 };

  const element = document.createElement('section');
  element.className = 'cooc-minimap';

  const frame = document.createElement('div');
  frame.className = 'cooc-minimap__frame';
  const canvas = document.createElement('canvas');
  canvas.className = 'cooc-minimap__canvas';
  // Why not role="img" か: この canvas はクリック・ドラッグ・矢印キーで表示位置を動かす
  // 操作面である。`img` は静止した画像を宣言する role であり、操作できることが支援技術に
  // 伝わらない。`tabindex` と併せて、キーボードだけでも到達できる状態にする。
  canvas.setAttribute('role', 'application');
  canvas.tabIndex = 0;
  frame.appendChild(canvas);

  // 操作ボタンは全体像の上（右下）へ重ねる。C4 のミニマップ（trail-viewer
  // `minimapCanvas.ts`）と同じ置き方で、視野を動かす操作が全体像から離れない。
  // Why not 全体像の下へ 1 行として並べるか: ボタン列がパネルの高さを取るぶん全体像が縮む。
  // 重ねても覆うのは右下の隅だけであり、そこは枠を追うときに最も情報が薄い領域である。
  const buttons = document.createElement('div');
  buttons.className = 'cooc-minimap__buttons';
  frame.appendChild(buttons);

  function createButton(action: string, icon: SVGSVGElement, onClick: () => void): HTMLButtonElement {
    const button = createPanelButton('cooc-minimap__button');
    button.dataset.action = action;
    button.appendChild(icon);
    button.addEventListener('click', onClick);
    buttons.appendChild(button);
    return button;
  }

  // 並びは縮小・拡大・全体表示の順（C4 のミニマップと同じ）。倍率を下げる側を左に置き、
  // 左から右へ「引く・寄る・全体へ戻す」と読めるようにする。
  const zoomOutButton = createButton('zoom-out', createIcon(ICON_ZOOM_OUT), () => options.onZoom(1 / ZOOM_STEP));
  const zoomInButton = createButton('zoom-in', createIcon(ICON_ZOOM_IN), () => options.onZoom(ZOOM_STEP));
  const fitButton = createButton('fit', createIcon(ICON_FIT), () => options.onFitContent());

  const hint = document.createElement('div');
  hint.className = 'cooc-minimap__hint';

  element.append(frame, hint);

  /** ミニマップ自身の視野。canvas の寸法に依存するため、使う直前に測って決める。 */
  function currentMinimapViewport(graph: RenderGraph, size: CanvasSize): ViewportState {
    return minimapViewport(graphBounds(graph), size);
  }

  /**
   * 隠れているタブの中にいるか。
   *
   * Why not `offsetParent === null` で見るか: jsdom はレイアウトを計算しないため常に
   * null を返し、「表示中なら描く」側のテストが成立しなくなる。タブの表示は `hidden`
   * 属性で切り替えているので、そちらを辿れば実ブラウザと jsdom の双方で同じ判定になる。
   */
  function isHidden(): boolean {
    return element.closest('[hidden]') !== null;
  }

  function draw(): void {
    scheduled = false;
    if (destroyed || isHidden()) return;
    const size = updateCanvasSize(canvas);
    // 描画前や、寸法が確定していない場面。描いても何も残らないうえ、表示へ戻った
    // ときに描き直さないと空のままになる（切替時の refresh() が対になっている）。
    if (size.width <= 0 || size.height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = options.getState();
    if (theme === null || themeModeAtRead !== state.themeMode) {
      theme = readCooccurrenceTheme(options.themeHost, state.themeMode);
      themeModeAtRead = state.themeMode;
    }
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastSize = size;
    const mini = currentMinimapViewport(state.graph, size);
    drawMinimap({
      ctx,
      width: size.width,
      height: size.height,
      graph: state.graph,
      viewport: mini,
      frame: state.graph.nodes.length === 0 ? null : visibleRect(state.viewport, state.canvasSize, mini),
      theme,
    });
    drawCount += 1;
  }

  function invalidate(): void {
    if (scheduled || destroyed) return;
    // 隠れている間は要求そのものを捨てる。図をドラッグしている間は毎フレーム要求が来るが、
    // 既定タブは「絞り込み」であり（仕様 §3.5）、ミニマップが隠れている状態が通常である。
    // 表示へ戻したときの描き直しは、切り替える側の refresh() が担う。
    if (isHidden()) return;
    scheduled = true;
    rafId = requestAnimationFrame(draw);
  }

  /** ポインタ位置を canvas の CSS ピクセル座標へ直す。 */
  function pointOf(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function moveTo(event: PointerEvent): void {
    const state = options.getState();
    const mini = currentMinimapViewport(state.graph, lastSize);
    options.onViewportChange(centerOnMinimapPoint(state.viewport, state.canvasSize, pointOf(event), mini));
  }

  /** 矢印キーの移動量。押されたキーに対応しなければ null。 */
  function stepOf(key: string): { dx: number; dy: number } | null {
    switch (key) {
      case 'ArrowLeft':
        return { dx: -NUDGE_STEP, dy: 0 };
      case 'ArrowRight':
        return { dx: NUDGE_STEP, dy: 0 };
      case 'ArrowUp':
        return { dx: 0, dy: -NUDGE_STEP };
      case 'ArrowDown':
        return { dx: 0, dy: NUDGE_STEP };
      default:
        return null;
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    // jsdom は pointer capture を実装していない。捕捉できない環境でも移動そのものは働く。
    canvas.setPointerCapture?.(event.pointerId);
    moveTo(event);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    moveTo(event);
  });
  const endDrag = (): void => {
    dragging = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (event) => {
    const step = stepOf(event.key);
    if (!step) return;
    // 既定動作（パネル列のスクロール）が残ると、キーで動かすたびに列の表示位置まで飛ぶ。
    event.preventDefault();
    const state = options.getState();
    const mini = currentMinimapViewport(state.graph, lastSize);
    options.onViewportChange(nudgeOnMinimap(state.viewport, state.canvasSize, mini, step.dx, step.dy));
  });

  function renderLabels(): void {
    canvas.setAttribute('aria-label', t('minimap.canvasLabel'));
    zoomInButton.title = t('view.zoomIn');
    zoomInButton.setAttribute('aria-label', t('view.zoomIn'));
    zoomOutButton.title = t('view.zoomOut');
    zoomOutButton.setAttribute('aria-label', t('view.zoomOut'));
    fitButton.title = t('view.fit');
    fitButton.setAttribute('aria-label', t('view.fit'));
    hint.textContent = t('minimap.hint');
  }

  renderLabels();
  invalidate();

  return {
    element,
    setT(next: CooccurrenceT): void {
      t = next;
      renderLabels();
    },
    refresh(): void {
      invalidate();
    },
    getDrawCount: () => drawCount,
    destroy(): void {
      destroyed = true;
      cancelAnimationFrame(rafId);
      element.remove();
    },
  };
}
