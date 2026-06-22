/**
 * 脱React の vanilla DOM「ImageCropTool」ファクトリ
 * （framework-decoupling Phase 3 / 追加のみ・本番未配線）。
 *
 * React 原版 `components/ImageCropTool.tsx`（canvas 画像クロップ + リサイズ + ルーラー/グリッド
 * オーバーレイ）の素 DOM 版。画像上でドラッグしてクロップ枠を選択し、canvas で切り出して dataUrl を
 * onCrop へ返す。倍率プリセット（25〜200%）でのリサイズ、ルーラー/グリッドの SVG オーバーレイも備える。
 *
 * React 版は React 合成イベント（onMouseDown/Move/Up）+ useState/useEffect/useRef/useCallback で
 * 状態管理していたが、vanilla 版は closure 変数 + ネイティブ addEventListener へ移植し、cleanup は
 * `destroy()` で解除する。パネル系のため `el` を返し、配置は呼び元が行う（self-append しない）。
 *
 * 変換規約:
 * - React props（src / onCrop / t）→ opts。
 * - `useIsDark` は不要（ui-vanilla / --am-color-* CSS 変数でテーマ追従。`getDivider` 等の
 *   isDark 分岐は --am-color-divider / --am-color-text-secondary / --am-color-text-disabled に置換）。
 * - `useCropInteraction` / `useCropEstimate` hook → closure ロジックへインライン移植（cropGeometry の
 *   純関数 applyDrawing/applyMoving/applyResizing/computeHitTest はそのまま再利用）。
 * - React 合成 onMouseDown/Move/Up → container への native addEventListener。
 * - Escape キャンセルの useEffect → cropping ON のときのみ document へ keydown listener を張る。
 * - 状態変化（cropping / cropRect / showRuler / showGrid / imgNatural）は手続き的な再描画関数
 *   （renderToolbar / renderOverlays）で最小更新する。
 */

import {
  createButton,
  createChip,
  createIconButton,
  createText,
  createTooltip,
  svgIcon,
  type IconButtonHandle,
} from "@anytime-markdown/ui-core";
import {
  CHIP_FONT_SIZE,
  PANEL_BUTTON_FONT_SIZE,
  STATUSBAR_FONT_SIZE,
} from "../constants/dimensions";
import {
  applyDrawing,
  applyMoving,
  applyResizing,
  computeHitTest,
  SCALE_PRESETS,
  type CropRect,
  type DragMode,
  type ResizeHandle,
} from "../utils/cropGeometry";
import type { TranslationFn } from "../types";

// ui/icons.tsx と同一の Material SVG path（Check / Close / Crop / GridOn /
// PhotoSizeSelectLarge / Straighten）。
const ICON_CHECK = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
const ICON_CLOSE =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const ICON_CROP =
  "M17 15h2V7c0-1.1-.9-2-2-2H9v2h8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2z";
const ICON_GRID_ON =
  "M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M8 20H4v-4h4zm0-6H4v-4h4zm0-6H4V4h4zm6 12h-4v-4h4zm0-6h-4v-4h4zm0-6h-4V4h4zm6 12h-4v-4h4zm0-6h-4v-4h4zm0-6h-4V4h4z";
const ICON_PHOTO_SIZE =
  "M21 15h2v2h-2zm0-4h2v2h-2zm2 8h-2v2c1 0 2-1 2-2M13 3h2v2h-2zm8 4h2v2h-2zm0-4v2h2c0-1-1-2-2-2M1 7h2v2H1zm16-4h2v2h-2zm0 16h2v2h-2zM3 3C2 3 1 4 1 5h2zm6 0h2v2H9zM5 3h2v2H5zm-4 8v8c0 1.1.9 2 2 2h12V11zm2 8 2.5-3.21 1.79 2.15 2.5-3.22L13 19z";
const ICON_STRAIGHTEN =
  "M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 10H3V8h2v4h2V8h2v4h2V8h2v4h2V8h2v4h2V8h2z";

const SVG_NS = "http://www.w3.org/2000/svg";
const EDGE_THRESHOLD = 0.02; // 2% of image for edge detection（useCropInteraction と同一）

/** {@link createImageCropTool} のオプション（React `ImageCropToolProps` の vanilla 置換）。 */
export interface CreateImageCropToolOptions {
  /** 画像ソース（URL / data URI）。 */
  src: string;
  /** クロップ / リサイズ確定（生成した PNG dataUrl を渡す）。 */
  onCrop: (croppedDataUrl: string) => void;
  /** i18n。 */
  t: TranslationFn;
}

/** {@link createImageCropTool} の戻り値。`el` を呼び元が配置する（self-append しない）。 */
export interface ImageCropToolHandle {
  /** ルート要素（toolbar + 画像 + オーバーレイ）。 */
  el: HTMLElement;
  /** listener / tooltip / 子コントロールを解放する。 */
  destroy: () => void;
}

/**
 * vanilla ImageCropTool を生成する。`el` を呼び元が配置し、destroy で listener と子ハンドルを解放する。
 */
export function createImageCropTool(
  opts: CreateImageCropToolOptions,
): ImageCropToolHandle {
  const { src, onCrop, t } = opts;
  const handles: Array<{ destroy: () => void }> = [];
  let destroyed = false;

  // --- 状態（React useState 群の closure 置換） ---
  let cropping = false;
  let showRuler = false;
  let showGrid = false;
  let imgNatural: { w: number; h: number } | null = null;

  // useCropInteraction 相当の状態。
  let cropRect: CropRect | null = null;
  let dragMode: DragMode = "none";
  let resizeHandle: ResizeHandle | null = null;
  let startPos: { x: number; y: number } | null = null;
  let startRect: CropRect | null = null;
  let hoverCursor = "crosshair";

  // --- ルート ---
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;flex-direction:column;flex:1;overflow:hidden;";

  // --- ツールバー ---
  const toolbar = document.createElement("div");
  toolbar.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:4px 8px;" +
    "border-bottom:1px solid var(--am-color-divider);min-height:32px;";
  root.appendChild(toolbar);

  // --- 画像 + オーバーレイ領域 ---
  const stage = document.createElement("div");
  stage.style.cssText =
    "flex:1;display:flex;align-items:center;justify-content:center;" +
    "overflow:auto;padding:16px;position:relative;cursor:default;";
  root.appendChild(stage);

  const imgWrap = document.createElement("div");
  imgWrap.style.cssText = "position:relative;display:inline-block;";
  stage.appendChild(imgWrap);

  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.draggable = false;
  img.crossOrigin = "anonymous";
  img.style.cssText =
    "display:block;max-width:100%;max-height:calc(100vh - 150px);" +
    "object-fit:contain;user-select:none;";
  imgWrap.appendChild(img);

  // オーバーレイ用コンテナ（ruler/grid SVG・crop SVG・crop プレビュー）を imgWrap 末尾へ。
  let rulerGridSvg: SVGSVGElement | null = null;
  let cropSvg: SVGSVGElement | null = null;
  let cropPreview: HTMLDivElement | null = null;

  // --- 相対座標（useCropInteraction.getRelativePos と同一） ---
  const getRelativePos = (
    e: MouseEvent,
  ): { x: number; y: number } | null => {
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  // --- crop estimate（useCropEstimate と同一ロジック） ---
  const computeCropEstimate = (): string | null => {
    if (!cropRect || cropRect.width < 0.01 || cropRect.height < 0.01) return null;
    if (dragMode !== "none") return null; // drawing 中は非表示
    const w = Math.round(cropRect.width * img.naturalWidth);
    const h = Math.round(cropRect.height * img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return `${w}x${h}`;
    ctx.drawImage(
      img,
      Math.round(cropRect.x * img.naturalWidth),
      Math.round(cropRect.y * img.naturalHeight),
      w,
      h,
      0,
      0,
      w,
      h,
    );
    try {
      const dataUrl = canvas.toDataURL?.("image/png");
      if (!dataUrl) return `${w}x${h}`;
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const bytes = Math.ceil((base64.length * 3) / 4);
      let sizeStr: string;
      if (bytes < 1024) sizeStr = `${bytes}B`;
      else if (bytes < 1024 * 1024) sizeStr = `${(bytes / 1024).toFixed(1)}KB`;
      else sizeStr = `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
      return `${w}x${h} / ${sizeStr}`;
    } catch {
      return `${w}x${h}`;
    }
  };

  // --- 適用 / キャンセル / リサイズ（React handleApplyCrop / handleCancelCrop / handleResize） ---
  const handleApplyCrop = (): void => {
    if (!cropRect) return;
    const canvas = document.createElement("canvas");
    const sx = Math.round(cropRect.x * img.naturalWidth);
    const sy = Math.round(cropRect.y * img.naturalHeight);
    const sw = Math.round(cropRect.width * img.naturalWidth);
    const sh = Math.round(cropRect.height * img.naturalHeight);
    if (sw < 1 || sh < 1) return;
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    try {
      const dataUrl = canvas.toDataURL?.("image/png");
      if (dataUrl) onCrop(dataUrl);
    } catch {
      // Canvas tainted by CORS-restricted image
      console.warn("[ImageCropTool] Cannot crop: image source is CORS-restricted");
    }
    cropping = false;
    cropRect = null;
    renderToolbar();
    renderOverlays();
    syncStageCursor();
  };

  const resetInteraction = (): void => {
    cropRect = null;
    dragMode = "none";
    resizeHandle = null;
    startRect = null;
    hoverCursor = "crosshair";
  };

  const handleCancelCrop = (): void => {
    cropping = false;
    resetInteraction();
    renderToolbar();
    renderOverlays();
    syncStageCursor();
  };

  /** 倍率指定でリサイズ（React handleResize）。 */
  const handleResize = (scale: number): void => {
    const newW = Math.round((img.naturalWidth * scale) / 100);
    const newH = Math.round((img.naturalHeight * scale) / 100);
    if (newW < 1 || newH < 1) return;
    const canvas = document.createElement("canvas");
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, newW, newH);
    try {
      const dataUrl = canvas.toDataURL?.("image/png");
      if (dataUrl) onCrop(dataUrl);
    } catch {
      console.warn("[ImageCropTool] Cannot resize: image source is CORS-restricted");
    }
  };

  // --- マウスドラッグ（useCropInteraction.handleMouseDown/Move/Up） ---
  const onMouseDown = (e: MouseEvent): void => {
    if (!cropping) return;
    const pos = getRelativePos(e);
    if (!pos) return;

    if (cropRect && cropRect.width > 0.01 && cropRect.height > 0.01) {
      const hit = computeHitTest(pos, cropRect, EDGE_THRESHOLD);
      if (hit.mode === "moving") {
        dragMode = "moving";
        startPos = pos;
        startRect = { ...cropRect };
        return;
      }
      if (hit.mode === "resizing") {
        dragMode = "resizing";
        resizeHandle = hit.handle;
        startPos = pos;
        startRect = { ...cropRect };
        return;
      }
    }
    // New drawing
    dragMode = "drawing";
    startPos = pos;
    cropRect = null;
    renderOverlays();
  };

  const onMouseMove = (e: MouseEvent): void => {
    const pos = getRelativePos(e);
    if (!pos) return;

    // Update cursor on hover
    if (
      dragMode === "none" &&
      cropping &&
      cropRect &&
      cropRect.width > 0.01 &&
      cropRect.height > 0.01
    ) {
      const hit = computeHitTest(pos, cropRect, EDGE_THRESHOLD);
      if (hit.cursor !== hoverCursor) {
        hoverCursor = hit.cursor;
        syncStageCursor();
      }
    }

    if (dragMode === "none" || !startPos) return;

    if (dragMode === "drawing") {
      cropRect = applyDrawing(startPos, pos);
    } else if (dragMode === "moving" && startRect) {
      cropRect = applyMoving(startPos, pos, startRect);
    } else if (dragMode === "resizing" && startRect && resizeHandle) {
      cropRect = applyResizing(startPos, pos, startRect, resizeHandle);
    }
    renderOverlays();
  };

  const onMouseUp = (): void => {
    const wasDragging = dragMode !== "none";
    dragMode = "none";
    resizeHandle = null;
    startRect = null;
    // drawing 終了で estimate / apply ボタン状態が変わるためツールバー再描画。
    if (wasDragging) {
      renderToolbar();
      renderOverlays();
    }
  };

  stage.addEventListener("mousedown", onMouseDown);
  stage.addEventListener("mousemove", onMouseMove);
  stage.addEventListener("mouseup", onMouseUp);

  // --- 画像 load → naturalWidth/Height を記録（React handleImgLoad） ---
  const onImgLoad = (): void => {
    imgNatural = { w: img.naturalWidth, h: img.naturalHeight };
    renderOverlays();
  };
  img.addEventListener("load", onImgLoad);
  // 既にキャッシュ済みで complete の場合に備える。
  if (img.complete && img.naturalWidth > 0) onImgLoad();

  // --- Escape でキャンセル（React useEffect: cropping 中のみ） ---
  const onKeyDown = (e: KeyboardEvent): void => {
    if (cropping && e.key === "Escape") handleCancelCrop();
  };
  document.addEventListener("keydown", onKeyDown);

  // --- stage カーソル（cropping 時 hoverCursor、それ以外 default） ---
  const syncStageCursor = (): void => {
    stage.style.cursor = cropping ? hoverCursor : "default";
  };

  // ===== ツールバー再描画 ============================================
  // ツールバーは cropping 状態で構成が完全に切り替わるため、子ハンドルを破棄して作り直す。
  let toolbarHandles: Array<{ destroy: () => void }> = [];
  function renderToolbar(): void {
    for (const h of toolbarHandles) h.destroy();
    toolbarHandles = [];
    toolbar.replaceChildren();

    if (cropping) {
      buildCroppingToolbar();
    } else {
      buildIdleToolbar();
    }
  }

  function buildCroppingToolbar(): void {
    const label = createText({
      variant: "caption",
      text: t("imageCropSelect"),
      style: "font-weight:600;color:var(--am-color-text-secondary);",
    });
    toolbarHandles.push(label);
    toolbar.appendChild(label.el);

    const estimate = computeCropEstimate();
    if (estimate) {
      const estEl = createText({
        variant: "caption",
        text: estimate,
        style:
          `color:var(--am-color-text-disabled);font-size:${STATUSBAR_FONT_SIZE};` +
          "font-family:monospace;white-space:nowrap;",
      });
      toolbarHandles.push(estEl);
      toolbar.appendChild(estEl.el);
    }

    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    toolbar.appendChild(spacer);

    if (cropRect && cropRect.width > 0.01 && cropRect.height > 0.01) {
      const checkIcon = svgIcon(ICON_CHECK, 14);
      const applyBtn = createButton({
        size: "small",
        variant: "contained",
        startIcon: checkIcon,
        label: t("imageCropApply"),
        onClick: handleApplyCrop,
      });
      // ImageCropTool.module.css .applyBtn（py 2px）+ font-size 相当を直接付与。
      applyBtn.el.style.paddingTop = "2px";
      applyBtn.el.style.paddingBottom = "2px";
      applyBtn.el.style.fontSize = PANEL_BUTTON_FONT_SIZE;
      toolbarHandles.push(applyBtn);
      toolbar.appendChild(applyBtn.el);
    }

    const closeBtn = createIconButton({
      size: "small",
      ariaLabel: t("close"),
      children: svgIcon(ICON_CLOSE, 16),
      onClick: handleCancelCrop,
    });
    toolbarHandles.push(closeBtn);
    toolbar.appendChild(closeBtn.el);
  }

  function buildIdleToolbar(): void {
    // crop 開始ボタン（Tooltip 付き）。
    const cropBtn = createIconButton({
      size: "small",
      ariaLabel: t("imageCrop"),
      children: svgIcon(ICON_CROP, 18),
      onClick: () => {
        cropping = true;
        renderToolbar();
        renderOverlays();
        syncStageCursor();
      },
    });
    toolbarHandles.push(cropBtn);
    const cropTip = createTooltip({ reference: cropBtn.el, title: t("imageCrop") });
    toolbarHandles.push(cropTip);
    toolbar.appendChild(cropBtn.el);

    // リサイズアイコン（装飾・Tooltip 付き）。
    const resizeIcon = svgIcon(ICON_PHOTO_SIZE, 16);
    resizeIcon.style.color = "var(--am-color-text-secondary)";
    resizeIcon.style.marginLeft = "4px";
    const resizeTip = createTooltip({ reference: resizeIcon as unknown as HTMLElement, title: t("imageResize") });
    toolbarHandles.push(resizeTip);
    toolbar.appendChild(resizeIcon);

    // 倍率プリセット Chip。
    for (const s of SCALE_PRESETS) {
      const chip = createChip({
        label: `${s}%`,
        size: "small",
        variant: "outlined",
        onClick: () => handleResize(s),
      });
      chip.el.style.height = "22px";
      chip.el.style.fontSize = CHIP_FONT_SIZE;
      toolbarHandles.push(chip);
      toolbar.appendChild(chip.el);
    }

    // 右寄せ群: ルーラー / グリッドトグル。
    const right = document.createElement("div");
    right.style.cssText =
      "margin-left:auto;display:flex;align-items:center;gap:4px;";

    const rulerBtn = createIconButton({
      size: "small",
      ariaLabel: t("imageRuler"),
      children: svgIcon(ICON_STRAIGHTEN, 16),
      onClick: () => {
        showRuler = !showRuler;
        applyToggleState(rulerBtn, showRuler);
        renderOverlays();
      },
    });
    applyToggleState(rulerBtn, showRuler);
    toolbarHandles.push(rulerBtn);
    const rulerTip = createTooltip({ reference: rulerBtn.el, title: t("imageRuler") });
    toolbarHandles.push(rulerTip);
    right.appendChild(rulerBtn.el);

    const gridBtn = createIconButton({
      size: "small",
      ariaLabel: t("imageGrid"),
      children: svgIcon(ICON_GRID_ON, 16),
      onClick: () => {
        showGrid = !showGrid;
        applyToggleState(gridBtn, showGrid);
        renderOverlays();
      },
    });
    applyToggleState(gridBtn, showGrid);
    toolbarHandles.push(gridBtn);
    const gridTip = createTooltip({ reference: gridBtn.el, title: t("imageGrid") });
    toolbarHandles.push(gridTip);
    right.appendChild(gridBtn.el);

    toolbar.appendChild(right);
  }

  /** トグルアイコンの active 状態（color="primary" 相当）と aria-pressed を反映する。 */
  function applyToggleState(btn: IconButtonHandle, active: boolean): void {
    btn.el.setAttribute("aria-pressed", active ? "true" : "false");
    // 非アクティブを "" にすると IconButton の color:inherit が消え <button> が UA 黒に戻る。
    btn.el.style.color = active ? "var(--am-color-primary-main)" : "inherit";
  }

  // ===== オーバーレイ再描画（ruler/grid SVG・crop SVG・crop プレビュー） =====
  function renderOverlays(): void {
    // 既存オーバーレイを撤去。
    rulerGridSvg?.remove();
    rulerGridSvg = null;
    cropSvg?.remove();
    cropSvg = null;
    cropPreview?.remove();
    cropPreview = null;

    if ((showRuler || showGrid) && imgNatural) {
      rulerGridSvg = buildRulerGridSvg(imgNatural);
      imgWrap.appendChild(rulerGridSvg);
    }

    if (cropping && cropRect) {
      cropSvg = buildCropSvg(cropRect);
      imgWrap.appendChild(cropSvg);
      cropPreview = buildCropPreview(cropRect);
      imgWrap.appendChild(cropPreview);
    }
  }

  /** ルーラー/グリッド SVG（React の svg viewBox + line/rect/text 群を素 DOM で再現）。 */
  function buildRulerGridSvg(natural: { w: number; h: number }): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;" +
      "pointer-events:none;overflow:visible;";
    svg.setAttribute("viewBox", `-20 -20 ${natural.w + 20} ${natural.h + 20}`);
    svg.setAttribute("preserveAspectRatio", "none");

    const step = Math.max(50, Math.round(Math.max(natural.w, natural.h) / 10 / 50) * 50);

    const line = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      stroke: string,
    ): SVGLineElement => {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", stroke);
      l.setAttribute("stroke-width", "1");
      return l;
    };
    const rect = (
      x: number,
      y: number,
      w: number,
      h: number,
      fill: string,
    ): SVGRectElement => {
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(w));
      r.setAttribute("height", String(h));
      r.setAttribute("fill", fill);
      return r;
    };
    const text = (x: number, y: number, value: number): SVGTextElement => {
      const tx = document.createElementNS(SVG_NS, "text");
      tx.setAttribute("x", String(x));
      tx.setAttribute("y", String(y));
      tx.setAttribute("font-size", "10");
      tx.setAttribute("fill", "rgba(255,255,255,0.7)");
      tx.textContent = String(value);
      return tx;
    };

    // Grid lines
    if (showGrid) {
      for (let x = step; x < natural.w; x += step) {
        svg.appendChild(line(x, 0, x, natural.h, "rgba(255,255,255,0.2)"));
      }
      for (let y = step; y < natural.h; y += step) {
        svg.appendChild(line(0, y, natural.w, y, "rgba(255,255,255,0.2)"));
      }
    }

    // Ruler（top + left）
    if (showRuler) {
      svg.appendChild(rect(0, -20, natural.w, 20, "rgba(0,0,0,0.6)"));
      for (let x = 0; x <= natural.w; x += step) {
        svg.appendChild(line(x, -20, x, 0, "rgba(255,255,255,0.6)"));
        svg.appendChild(text(x + 3, -6, x));
      }
      svg.appendChild(rect(-20, 0, 20, natural.h, "rgba(0,0,0,0.6)"));
      for (let y = 0; y <= natural.h; y += step) {
        svg.appendChild(line(-20, y, 0, y, "rgba(255,255,255,0.6)"));
        svg.appendChild(text(-18, y + 12, y));
      }
    }

    return svg;
  }

  /** クロップ枠 SVG（暗い背景 + 透明な選択範囲 + 破線枠）。 */
  function buildCropSvg(cr: CropRect): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";

    const dark = document.createElementNS(SVG_NS, "rect");
    dark.setAttribute("x", "0");
    dark.setAttribute("y", "0");
    dark.setAttribute("width", "100%");
    dark.setAttribute("height", "100%");
    dark.setAttribute("fill", "rgba(0,0,0,0.5)");
    svg.appendChild(dark);

    const sel = document.createElementNS(SVG_NS, "rect");
    sel.setAttribute("x", `${cr.x * 100}%`);
    sel.setAttribute("y", `${cr.y * 100}%`);
    sel.setAttribute("width", `${cr.width * 100}%`);
    sel.setAttribute("height", `${cr.height * 100}%`);
    sel.setAttribute("fill", "rgba(0,0,0,0)");
    sel.setAttribute("stroke", "white");
    sel.setAttribute("stroke-width", "2");
    sel.setAttribute("stroke-dasharray", "4 2");
    svg.appendChild(sel);

    return svg;
  }

  /** クロップ範囲だけ画像を表示するプレビュー div（React の overflow:hidden + 拡大 img）。 */
  function buildCropPreview(cr: CropRect): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      `position:absolute;left:${cr.x * 100}%;top:${cr.y * 100}%;` +
      `width:${cr.width * 100}%;height:${cr.height * 100}%;` +
      "overflow:hidden;pointer-events:none;";
    const inner = document.createElement("img");
    inner.src = src;
    inner.alt = "";
    inner.draggable = false;
    // width/height が 0 のとき除算を避ける（NaN 化防止）。
    const w = cr.width || 1;
    const h = cr.height || 1;
    inner.style.cssText =
      `position:absolute;left:-${(cr.x / w) * 100}%;top:-${(cr.y / h) * 100}%;` +
      `width:${(1 / w) * 100}%;height:${(1 / h) * 100}%;`;
    wrap.appendChild(inner);
    return wrap;
  }

  // 初期描画。
  renderToolbar();
  renderOverlays();
  syncStageCursor();

  return {
    el: root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stage.removeEventListener("mousedown", onMouseDown);
      stage.removeEventListener("mousemove", onMouseMove);
      stage.removeEventListener("mouseup", onMouseUp);
      img.removeEventListener("load", onImgLoad);
      document.removeEventListener("keydown", onKeyDown);
      for (const h of toolbarHandles) h.destroy();
      toolbarHandles = [];
      for (const h of handles) h.destroy();
    },
  };
}
