/**
 * 脱React の vanilla DOM「ImageAnnotationDialog」ファクトリ
 * （framework-decoupling Phase 3 / ホスト隔離・追加のみ・本番未配線）。
 *
 * React 原版 `components/ImageAnnotationDialog.tsx`（MUI/React 依存）の素 DOM 版。
 * 画像上に rect / circle / line の注釈を SVG（viewBox 0 0 100 100・% 座標）で描画し、
 * 各注釈にコメントを付与できる注釈エディタを提供する。
 *
 * 描画ロジックは React 原版と同一だが、合成 mouse イベント（handleMouseDown/Move/Up）は
 * SVG への native addEventListener に置換する。tool / color / items / drawing 等の React state は
 * closure 変数 + 手続き的な SVG 再描画（renderShapes）で表現する。
 *
 * テーマ色は `--am-color-*` CSS 変数（applyEditorThemeCssVars 注入）で追従するため、原版の
 * `useIsDark` / getDivider / getPrimaryMain / getTextSecondary 分岐は不要（CSS 変数を直接参照）。
 * `useMarkdownT` は opts.t で受ける。
 *
 * 戻り値は `{ el, destroy() }`。createDialog（fullScreen・self-append）が portalTarget
 * （既定 document.body）へ自前マウントするため生成時点で開く（el は参照用）。確定（close）で
 * 現在の items を opts.onSave へ渡してから opts.onClose を呼ぶ。
 */

import {
  createDialog,
  createIconButton,
  createTextField,
  createToggleButton,
  createToggleButtonGroup,
  createTooltip,
  svgIcon,
  type IconButtonHandle,
  type TextFieldHandle,
} from "@anytime-markdown/ui-core";
import {
  BADGE_NUMBER_FONT_SIZE,
  PANEL_INPUT_FONT_SIZE,
  SMALL_CAPTION_FONT_SIZE,
} from "../constants/dimensions";
import type { AnnotationTool, ImageAnnotation } from "../types/imageAnnotation";
import { ANNOTATION_COLORS, generateAnnotationId } from "../types/imageAnnotation";

const SVG_NS = "http://www.w3.org/2000/svg";

// ui/icons.tsx と同一の Material SVG path（24x24）。
const ICON_RECTANGLE_OUTLINED = "M2 4v16h20V4zm18 14H4V6h16z";
const ICON_CIRCLE_OUTLINED =
  "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8";
const ICON_HORIZONTAL_RULE = "M4 11h16v2H4z";
const ICON_AUTO_FIX_OFF =
  "m23 1-2.5 1.4L18 1l1.4 2.5L18 6l2.5-1.4L23 6l-1.4-2.5zm-8.34 6.22 2.12 2.12-2.44 2.44.81.81 2.55-2.55c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0L11.4 8.84l.81.81zm-.78 6.65-3.75-3.75-6.86-6.86L2 4.53l6.86 6.86-6.57 6.57c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0l6.57-6.57L19.47 22l1.27-1.27z";
const ICON_CLOSE =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const ICON_DELETE_OUTLINE =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM8 9h8v10H8zm7.5-5-1-1h-5l-1 1H5v2h14V4z";

/** ツールバーの図形ツール定義（value + ラベル i18n キー + アイコン path）。 */
const TOOL_BUTTONS: ReadonlyArray<{ value: AnnotationTool; labelKey: string; icon: string }> = [
  { value: "rect", labelKey: "annotationRect", icon: ICON_RECTANGLE_OUTLINED },
  { value: "circle", labelKey: "annotationCircle", icon: ICON_CIRCLE_OUTLINED },
  { value: "line", labelKey: "annotationLine", icon: ICON_HORIZONTAL_RULE },
  { value: "eraser", labelKey: "annotationEraser", icon: ICON_AUTO_FIX_OFF },
];

/** {@link createImageAnnotationDialog} のオプション（React `ImageAnnotationDialogProps` の vanilla 置換）。 */
export interface CreateImageAnnotationDialogOptions {
  /** i18n。React 原版の `t` prop 相当（useMarkdownT を opts 引数化）。 */
  t: (key: string) => string;
  /** 注釈対象の画像 URL。 */
  src: string;
  /** 初期注釈（既存の注釈群）。 */
  annotations: ImageAnnotation[];
  /** 確定（close）時に呼ばれ、現在の注釈群を渡す。React 原版 `onSave` 相当。 */
  onSave: (annotations: ImageAnnotation[]) => void;
  /** ダイアログを閉じる要求のコールバック。React 原版 `onClose` 相当。 */
  onClose: () => void;
}

/** {@link createImageAnnotationDialog} の戻り値。 */
interface ImageAnnotationDialogHandle {
  /** ルート要素（fixed overlay・参照用。生成時に document.body へ自前マウント済み）。 */
  el: HTMLElement;
  /** listener / 子コントロール / overlay の解放。閉じる時に必ず呼ぶ。 */
  destroy: () => void;
}

/** プレビュー用の注釈（id なし・badge 非表示）。React 原版 previewAnnotation 相当。 */
type ShapeLike = Pick<ImageAnnotation, "type" | "x1" | "y1" | "x2" | "y2" | "color">;

/**
 * vanilla 版 ImageAnnotationDialog を生成する。
 *
 * - 生成（= open）と同時に fixed overlay を document.body へマウントする（React 原版の
 *   `position:fixed;inset:0;z-index:1300` を踏襲）。
 * - tool / color / items / drawing / preview / selectedId は closure 変数で管理し、
 *   SVG（shapes）とコメントパネルを手続き的に再描画する。
 * - SVG への mousedown / mousemove / mouseup（native）でドラッグ描画する（React 合成イベント置換）。
 * - 確定（close ボタン）で onSave(items) → onClose。
 */
export function createImageAnnotationDialog(
  opts: CreateImageAnnotationDialogOptions,
): ImageAnnotationDialogHandle {
  const { t, src, onSave, onClose } = opts;

  // --- closure state（React useState/useRef 相当） ---------------------------
  let tool: AnnotationTool = "rect";
  let color: string = ANNOTATION_COLORS[0].value;
  let items: ImageAnnotation[] = [...opts.annotations];
  let drawing: { x1: number; y1: number } | null = null;
  let preview: { x2: number; y2: number } | null = null;
  let selectedId: string | null = null;
  let destroyed = false;

  // 破棄対象の子コントロール / tooltip を集約する。
  const childHandles: Array<{ destroy: () => void }> = [];

  // --- Dialog（fullScreen・role=dialog + aria-modal + Escape クローズ + フォーカストラップ） ---
  // 兄弟ダイアログ（GifRecorderDialog 等）と同パターン。Escape も close ボタンと同じ
  // handleClose（onSave → onClose）へ束ねる。
  const dialog = createDialog({
    onClose: () => handleClose(),
    fullScreen: true,
    ariaLabel: t("annotate"),
  });
  const overlay = dialog.paper;
  overlay.style.padding = "0";

  // ==========================================================================
  // Toolbar
  // ==========================================================================
  const toolbar = document.createElement("div");
  toolbar.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:8px 16px;" +
    "border-bottom:1px solid var(--am-color-divider);flex-shrink:0;";

  // tool ToggleButtonGroup（exclusive・value を直接更新）。
  const toolGroup = createToggleButtonGroup({
    value: tool,
    size: "small",
    ariaLabel: t("annotationToolGroup"),
    onChange: (v) => {
      if (typeof v === "string") {
        tool = v as AnnotationTool;
      }
    },
  });
  childHandles.push(toolGroup);
  for (const def of TOOL_BUTTONS) {
    const icon = svgIcon(def.icon, 18);
    const btn = createToggleButton({
      value: def.value,
      ariaLabel: t(def.labelKey),
      children: icon,
    });
    childHandles.push(btn);
    // ネイティブ title（Tooltip 相当）も付与する（React は Tooltip ラップ）。
    const tip = createTooltip({ reference: btn.el, title: t(def.labelKey) });
    childHandles.push(tip);
    toolGroup.register(btn);
  }
  toolbar.appendChild(toolGroup.el);

  // color スウォッチ群。
  const colorRow = document.createElement("div");
  colorRow.style.cssText = "display:flex;gap:4px;margin-left:8px;";
  const swatchButtons = new Map<string, IconButtonHandle>();
  for (const c of ANNOTATION_COLORS) {
    const swatch = createIconButton({
      size: "small",
      ariaLabel: c.label,
      onClick: () => {
        color = c.value;
        syncSwatchSelection();
      },
    });
    // 円形・色塗り・選択枠（React の colorSwatch class + inline style 相当）。
    swatch.el.style.width = "20px";
    swatch.el.style.height = "20px";
    swatch.el.style.backgroundColor = c.value;
    swatch.el.style.border = "2px solid var(--am-color-divider)";
    childHandles.push(swatch);
    swatchButtons.set(c.value, swatch);
    colorRow.appendChild(swatch.el);
  }
  toolbar.appendChild(colorRow);

  /** 選択中 color のスウォッチ枠を primary に、それ以外を divider にする。 */
  function syncSwatchSelection(): void {
    for (const [value, handle] of swatchButtons) {
      handle.el.style.borderColor =
        value === color ? "var(--am-color-primary-main)" : "var(--am-color-divider)";
    }
  }
  syncSwatchSelection();

  // close（確定）。位置は他の全画面編集ダイアログ（TableEditDialog / crop 等）に合わせて
  // ツールバー左端（先頭）へ置く。
  const closeBtn = createIconButton({
    size: "small",
    ariaLabel: t("close"),
    title: t("close"),
    children: svgIcon(ICON_CLOSE, 24),
    onClick: () => handleClose(),
  });
  childHandles.push(closeBtn);
  // tools / colors / undo より前（左端）に挿入する。
  const closeDivider = document.createElement("div");
  closeDivider.style.cssText =
    "width:1px;align-self:stretch;background-color:var(--am-color-divider);margin:4px 0;";
  toolbar.prepend(closeDivider);
  toolbar.prepend(closeBtn.el);

  overlay.appendChild(toolbar);

  // ==========================================================================
  // Main（Canvas + Comment Panel）
  // ==========================================================================
  const main = document.createElement("div");
  main.style.cssText = "flex:1;display:flex;overflow:hidden;";

  // --- Canvas エリア --------------------------------------------------------
  const canvasArea = document.createElement("div");
  canvasArea.style.cssText =
    "flex:1;display:flex;align-items:center;justify-content:center;" +
    "overflow:hidden;padding:16px;cursor:crosshair;";

  const imgWrap = document.createElement("div");
  imgWrap.style.cssText = "position:relative;max-width:100%;max-height:100%;";

  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.draggable = false;
  img.style.cssText =
    "display:block;max-width:100%;max-height:calc(100vh - 120px);" +
    "object-fit:contain;user-select:none;";

  // SVG オーバーレイ（viewBox 0 0 100 100・% 座標）。
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  // 描画面の識別子（ツールアイコンの svg と区別するため）。
  svg.setAttribute("data-am-annotation-surface", "");
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";

  imgWrap.append(img, svg);
  canvasArea.appendChild(imgWrap);
  main.appendChild(canvasArea);

  // --- Comment Panel --------------------------------------------------------
  const panel = document.createElement("div");
  panel.style.cssText =
    "width:280px;border-left:1px solid var(--am-color-divider);" +
    "display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;";

  const panelHeader = document.createElement("div");
  panelHeader.style.cssText = "padding:8px 12px;border-bottom:1px solid var(--am-color-divider);";
  const panelTitle = document.createElement("div");
  panelTitle.style.cssText = "font-size:0.875rem;font-weight:700;line-height:1.57;";
  panelHeader.appendChild(panelTitle);

  const panelBody = document.createElement("div");
  panelBody.style.cssText = "flex:1;overflow:auto;padding:8px;";

  panel.append(panelHeader, panelBody);
  main.appendChild(panel);

  overlay.appendChild(main);

  // ==========================================================================
  // 座標変換 / 描画（React 原版 toPercent / renderAnnotation と同一ロジック）
  // ==========================================================================

  /** mouse 位置を SVG に対する % 座標へ変換（0〜100 にクランプ）。 */
  function toPercent(e: MouseEvent): { x: number; y: number } | null {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }

  /** 1 注釈（または preview）を `<g>` として組む。React 原版 renderAnnotation の素 DOM 版。 */
  function buildShape(
    a: ShapeLike & { id?: string },
    index: number,
    selected: boolean,
    showBadge: boolean,
  ): SVGGElement {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("opacity", selected ? "1" : "0.8");

    const stroke = a.color;
    const strokeWidth = selected ? "3" : "2";
    const interactive = showBadge && !!a.id;
    const cursor = interactive ? "pointer" : "default";

    const onShapeClick = (e: Event): void => {
      e.stopPropagation();
      if (a.id) handleShapeClick(a.id);
    };

    if (a.type === "rect") {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(Math.min(a.x1, a.x2)));
      rect.setAttribute("y", String(Math.min(a.y1, a.y2)));
      rect.setAttribute("width", String(Math.abs(a.x2 - a.x1)));
      rect.setAttribute("height", String(Math.abs(a.y2 - a.y1)));
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", strokeWidth);
      rect.setAttribute("fill", "none");
      rect.style.cursor = cursor;
      if (interactive) rect.addEventListener("click", onShapeClick);
      g.appendChild(rect);
    } else if (a.type === "circle") {
      const ellipse = document.createElementNS(SVG_NS, "ellipse");
      ellipse.setAttribute("cx", String((a.x1 + a.x2) / 2));
      ellipse.setAttribute("cy", String((a.y1 + a.y2) / 2));
      ellipse.setAttribute("rx", String(Math.abs(a.x2 - a.x1) / 2));
      ellipse.setAttribute("ry", String(Math.abs(a.y2 - a.y1) / 2));
      ellipse.setAttribute("stroke", stroke);
      ellipse.setAttribute("stroke-width", strokeWidth);
      ellipse.setAttribute("fill", "none");
      ellipse.style.cursor = cursor;
      if (interactive) ellipse.addEventListener("click", onShapeClick);
      g.appendChild(ellipse);
    } else {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(a.x1));
      line.setAttribute("y1", String(a.y1));
      line.setAttribute("x2", String(a.x2));
      line.setAttribute("y2", String(a.y2));
      line.setAttribute("stroke", stroke);
      line.setAttribute("stroke-width", strokeWidth);
      line.style.cursor = cursor;
      if (interactive) line.addEventListener("click", onShapeClick);
      g.appendChild(line);
    }

    // 番号バッジ（preview では非表示）。
    if (showBadge) {
      const badgeX = Math.min(a.x1, a.x2);
      const badgeY = Math.min(a.y1, a.y2);
      const badge = document.createElementNS(SVG_NS, "circle");
      badge.setAttribute("cx", String(badgeX));
      badge.setAttribute("cy", String(badgeY));
      badge.setAttribute("r", "2.5");
      badge.setAttribute("fill", stroke);
      badge.style.cursor = cursor;
      if (interactive) badge.addEventListener("click", onShapeClick);
      g.appendChild(badge);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(badgeX));
      label.setAttribute("y", String(badgeY));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      label.setAttribute("font-size", "3");
      label.setAttribute("fill", "white");
      label.setAttribute("font-weight", "bold");
      label.style.pointerEvents = "none";
      label.textContent = String(index + 1);
      g.appendChild(label);
    }

    return g;
  }

  /** SVG 内の全 shape を作り直す（items + preview）。 */
  function renderShapes(): void {
    svg.replaceChildren();
    items.forEach((a, i) => {
      svg.appendChild(buildShape(a, i, a.id === selectedId, true));
    });
    if (drawing && preview) {
      const previewShape: ShapeLike = {
        type: tool === "eraser" ? "rect" : tool,
        x1: drawing.x1,
        y1: drawing.y1,
        x2: preview.x2,
        y2: preview.y2,
        color,
      };
      svg.appendChild(buildShape(previewShape, items.length, false, false));
    }
  }

  // ==========================================================================
  // コメントパネル描画
  // ==========================================================================

  // 各注釈の TextField ハンドル（再描画時に破棄して作り直す）。
  let panelFieldHandles: TextFieldHandle[] = [];
  let panelItemButtonHandles: IconButtonHandle[] = [];

  /** パネルの注釈リストを作り直す（items の数・選択状態を反映）。 */
  function renderPanel(): void {
    // 既存の子コントロールを破棄する。
    for (const h of panelFieldHandles) h.destroy();
    for (const h of panelItemButtonHandles) h.destroy();
    panelFieldHandles = [];
    panelItemButtonHandles = [];
    panelBody.replaceChildren();

    panelTitle.textContent = `${t("commentPanel")} (${items.length})`;

    if (items.length === 0) {
      const empty = document.createElement("span");
      empty.textContent = t("annotate");
      empty.style.cssText =
        "display:block;text-align:center;padding:32px 0;font-size:0.75rem;" +
        "color:var(--am-color-text-secondary);";
      panelBody.appendChild(empty);
      return;
    }

    items.forEach((a, i) => {
      let annotationLabel: string;
      if (a.type === "rect") annotationLabel = t("annotationRect");
      else if (a.type === "circle") annotationLabel = t("annotationCircle");
      else annotationLabel = t("annotationLine");

      const itemEl = document.createElement("div");
      const isSelected = a.id === selectedId;
      itemEl.style.cssText =
        "margin-bottom:8px;padding:8px;border-radius:4px;cursor:pointer;" +
        `border:1px solid ${isSelected ? "var(--am-color-primary-main)" : "var(--am-color-divider)"};`;
      itemEl.addEventListener("click", () => {
        selectedId = a.id;
        renderShapes();
        renderPanel();
      });

      // ヘッダー行（番号バッジ + 図形ラベル + 削除）。
      const headerRow = document.createElement("div");
      headerRow.style.cssText = "display:flex;align-items:center;gap:4px;margin-bottom:4px;";

      const badge = document.createElement("div");
      badge.style.cssText =
        "width:18px;height:18px;border-radius:50%;display:flex;align-items:center;" +
        `justify-content:center;flex-shrink:0;background-color:${a.color};`;
      const badgeNum = document.createElement("span");
      badgeNum.textContent = String(i + 1);
      badgeNum.style.cssText = `color:white;font-weight:700;font-size:${BADGE_NUMBER_FONT_SIZE};`;
      badge.appendChild(badgeNum);

      const typeLabel = document.createElement("span");
      typeLabel.textContent = annotationLabel;
      typeLabel.style.cssText =
        `color:var(--am-color-text-secondary);font-size:${SMALL_CAPTION_FONT_SIZE};`;

      const rowSpacer = document.createElement("div");
      rowSpacer.style.flex = "1";

      const delBtn = createIconButton({
        size: "xs",
        ariaLabel: t("delete"),
        children: svgIcon(ICON_DELETE_OUTLINE, 14),
        onClick: (e) => {
          e.stopPropagation();
          handleDeleteItem(a.id);
        },
      });
      panelItemButtonHandles.push(delBtn);

      headerRow.append(badge, typeLabel, rowSpacer, delBtn.el);
      itemEl.appendChild(headerRow);

      // コメント入力（multiline）。
      const field = createTextField({
        size: "small",
        multiline: true,
        minRows: 1,
        maxRows: 3,
        fullWidth: true,
        placeholder: t("commentPanel"),
        value: a.comment ?? "",
        style: {
          ["--tf-input-font-size" as string]: PANEL_INPUT_FONT_SIZE,
          ["--tf-input-pad-y" as string]: "4px",
        } as Partial<CSSStyleDeclaration>,
        onChange: (e) => {
          handleCommentChange(a.id, (e.target as HTMLTextAreaElement).value);
        },
        onClick: (e) => e.stopPropagation(),
      });
      panelFieldHandles.push(field);
      itemEl.appendChild(field.el);

      panelBody.appendChild(itemEl);
    });
  }

  // ==========================================================================
  // ハンドラ（React 原版の useCallback 群と同一ロジック）
  // ==========================================================================

  function handleShapeClick(id: string): void {
    if (tool === "eraser") {
      items = items.filter((a) => a.id !== id);
      if (selectedId === id) selectedId = null;
    } else {
      selectedId = id;
    }
    renderShapes();
    renderPanel();
  }

  function handleCommentChange(id: string, comment: string): void {
    // 値だけ更新する（再描画は不要・field 自身が DOM を保持）。
    items = items.map((a) => (a.id === id ? { ...a, comment } : a));
  }

  function handleDeleteItem(id: string): void {
    items = items.filter((a) => a.id !== id);
    if (selectedId === id) selectedId = null;
    renderShapes();
    renderPanel();
  }

  function handleClose(): void {
    onSave(items);
    onClose();
  }

  // --- SVG ドラッグ描画（native mouse listener） ----------------------------
  const onMouseDown = (e: MouseEvent): void => {
    if (tool === "eraser") return;
    selectedId = null;
    const pt = toPercent(e);
    if (pt) {
      drawing = { x1: pt.x, y1: pt.y };
    }
    renderShapes();
    renderPanel();
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!drawing) return;
    const pt = toPercent(e);
    if (pt) {
      preview = { x2: pt.x, y2: pt.y };
      renderShapes();
    }
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (!drawing || tool === "eraser") {
      drawing = null;
      preview = null;
      renderShapes();
      return;
    }
    const pt = toPercent(e);
    if (!pt) {
      drawing = null;
      preview = null;
      renderShapes();
      return;
    }
    // 動きが小さすぎる場合は注釈を作らない（誤クリック判定。React 原版と同一閾値）。
    if (Math.abs(pt.x - drawing.x1) < 1 && Math.abs(pt.y - drawing.y1) < 1) {
      drawing = null;
      preview = null;
      renderShapes();
      return;
    }
    const id = generateAnnotationId();
    const newItem: ImageAnnotation = {
      id,
      type: tool,
      x1: drawing.x1,
      y1: drawing.y1,
      x2: pt.x,
      y2: pt.y,
      color,
      comment: "",
    };
    items = [...items, newItem];
    selectedId = id;
    drawing = null;
    preview = null;
    renderShapes();
    renderPanel();
  };

  svg.addEventListener("mousedown", onMouseDown);
  svg.addEventListener("mousemove", onMouseMove);
  svg.addEventListener("mouseup", onMouseUp);

  // --- 初期描画 -------------------------------------------------------------
  // マウントは createDialog が生成時に自前で行う（portalTarget 既定 document.body）。
  renderShapes();
  renderPanel();

  return {
    el: dialog.el,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      svg.removeEventListener("mousedown", onMouseDown);
      svg.removeEventListener("mousemove", onMouseMove);
      svg.removeEventListener("mouseup", onMouseUp);
      for (const h of childHandles) h.destroy();
      for (const h of panelFieldHandles) h.destroy();
      for (const h of panelItemButtonHandles) h.destroy();
      panelFieldHandles = [];
      panelItemButtonHandles = [];
      dialog.destroy();
    },
  };
}
