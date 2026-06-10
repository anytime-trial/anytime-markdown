/**
 * 脱React の vanilla DOM「OutlinePanel」ファクトリ
 * （framework-decoupling Phase 3 / D・追加のみ・本番未配線）。
 *
 * React 原版 `components/OutlinePanel.tsx`（MUI Paper / ButtonBase / Collapse / IconButton /
 * Tooltip / Text 消費）を素 DOM へ移植したもの。見出しツリーパネルで、以下を提供する:
 * - 見出し一覧クリックでスクロール（onOutlineClick(pos)）
 * - 折り畳み（Collapse）と fold/unfold-all トグル
 * - ブロック表示トグル（codeBlock / table / image / plantuml / mermaid）
 * - 見出しの drag & drop / Alt+Arrow による並べ替え（onHeadingDragEnd(from, to)）
 * - 行ホバー時の削除ボタン（onOutlineDelete(pos, kind)）
 * - 章番号の挿入 / 除去（onInsertSectionNumbers / onRemoveSectionNumbers）
 * - リサイズハンドル（onResizeStart(e) + ←→ キーで幅変更）
 *
 * React 版は親フック（useEditorState 系）が headings / foldedIndices / hiddenByFold を計算して
 * props で渡していたが、vanilla 版は `editor` を opts で受け、`extractHeadings(editor)` で内部
 * 集計し `editor.on("update"|"transaction")` 購読で再描画する。fold 状態は closure で管理する。
 *
 * 変換規約:
 * - React props → opts。`handleOutlineClick` → `onOutlineClick`、`handleOutlineResizeStart`
 *   → `onResizeStart`、`setOutlineWidth` のキーボード操作は `onWidthChange(next)` で通知する。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。React 版の
 *   getTextPrimary/Secondary/Disabled/Divider/PrimaryMain(isDark) は `--am-color-*` を直接参照。
 * - `useState`（showBlocks / dragIdx / dropIdx）→ closure 変数 + 手続き的再描画。
 * - `useMemo`（headingOnlyIndices / map）→ render 毎に再計算する素関数。
 * - Collapse は ui-vanilla createCollapse（unmountOnExit）に置換。
 * - パネル系のため `el` を返し、呼び元が配置する（self-append しない）。`destroy()` で
 *   editor 購読・listener・子コントロール（Tooltip / IconButton / Collapse）を解放する。
 */

import type { Editor } from "@anytime-markdown/markdown-core";
import {
  createCollapse,
  createIconButton,
  createPaper,
  createText,
  createTooltip,
  svgIcon,
} from "../ui-vanilla";
import { OUTLINE_FONT_SIZE, PANEL_HEADER_MIN_HEIGHT } from "../constants/dimensions";
import type { HeadingItem, OutlineKind, TranslationFn } from "../types";
import { extractHeadings } from "../types";

// ui/icons.tsx と同一の Material SVG path。
const ICON_KEYBOARD_ARROW_DOWN = "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z";
const ICON_CODE = "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z";
const ICON_GRID_ON =
  "M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2M8 20H4v-4h4zm0-6H4v-4h4zm0-6H4V4h4zm6 12h-4v-4h4zm0-6h-4v-4h4zm0-6h-4V4h4zm6 12h-4v-4h4zm0-6h-4v-4h4zm0-6h-4V4h4z";
const ICON_IMAGE =
  "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z";
const ICON_SCHEMA =
  "M14 9v2h-3V9H8.5V7H11V1H4v6h2.5v2H4v6h2.5v2H4v6h7v-6H8.5v-2H11v-2h3v2h7V9z";
const ICON_CATEGORY = "m12 2-5.5 9h11z M3 13.5h8v8H3z";
const ICON_DELETE_OUTLINE =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM8 9h8v10H8zm7.5-5-1-1h-5l-1 1H5v2h14V4z";
const ICON_FORMAT_LIST_NUMBERED =
  "M2 17h2v.5H3v1h1v.5H2v1h3v-4H2zm1-9h1V4H2v1h1zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2zm5-6v2h14V5zm0 14h14v-2H7zm0-6h14v-2H7z";
const ICON_FORMAT_LIST_BULLETED =
  "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5m0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5m0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5M7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z";
const ICON_UNFOLD_LESS =
  "M7.41 18.59 8.83 20 12 16.83 15.17 20l1.41-1.41L12 14zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10z";
const ICON_UNFOLD_MORE =
  "M12 5.83 15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15z";
// Mermaid 公式ロゴ（icons/MermaidIcon.tsx と同一・viewBox 0 0 490.16 490.16）。
const MERMAID_PATHS = [
  "M407.48,111.18A165.2,165.2,0,0,0,245.08,220,165.2,165.2,0,0,0,82.68,111.18a165.5,165.5,0,0,0,72.06,143.64,88.81,88.81,0,0,1,38.53,73.45v50.86H296.9V328.27a88.8,88.8,0,0,1,38.52-73.45,165.41,165.41,0,0,0,72.06-143.64Z",
  "M160.63,328.27a56.09,56.09,0,0,0-24.27-46.49,198.74,198.74,0,0,1-28.54-23.66A196.87,196.87,0,0,1,82.53,227V379.13h78.1Z",
  "M329.53,328.27a56.09,56.09,0,0,1,24.27-46.49,198.74,198.74,0,0,0,28.54-23.66A196.87,196.87,0,0,0,407.63,227V379.13h-78.1Z",
];

/** ブロック種別 → SVG path（heading 以外）。fontSize 14 相当。 */
const BLOCK_ICON: Record<Exclude<OutlineKind, "heading">, string | readonly string[]> = {
  codeBlock: ICON_CODE,
  table: ICON_GRID_ON,
  image: ICON_IMAGE,
  plantuml: ICON_SCHEMA,
  mermaid: MERMAID_PATHS,
};

/** Mermaid のロゴだけ viewBox が異なるため専用生成（svgIcon は 0 0 24 24 固定のため）。 */
function mermaidSvg(size: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 490.16 490.16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  for (const d of MERMAID_PATHS) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

/** ブロックアイコンの SVG 要素を作る（mermaid は viewBox が異なるため分岐）。 */
function blockIconSvg(kind: Exclude<OutlineKind, "heading">, size = 14): SVGSVGElement {
  if (kind === "mermaid") return mermaidSvg(size);
  return svgIcon(BLOCK_ICON[kind], size);
}

/** 直前の heading からブロック（非 heading）項目の左パディング（rem 単位）を求める。React と同値。 */
function computeBlockPadding(idx: number, headings: HeadingItem[]): number {
  for (let i = idx - 1; i >= 0; i--) {
    if (headings[i].kind === "heading") {
      return (headings[i].level - 1) * 1.5 + 3.25;
    }
  }
  return 1;
}

/** {@link createOutlinePanel} のオプション（React `OutlinePanelProps` の vanilla 置換）。 */
export interface CreateOutlinePanelOptions {
  /** TipTap エディタ。見出し集計と `update`/`transaction` 購読に使う。 */
  editor: Editor;
  /** i18n。 */
  t: TranslationFn;
  /** パネル幅(px)。 */
  outlineWidth: number;
  /** パネル最大高さ(px)。overflow:auto のスクロール上限。 */
  editorHeight: number;
  /** 見出し/ブロッククリックでスクロール。React `handleOutlineClick` 相当。 */
  onOutlineClick: (pos: number) => void;
  /** リサイズハンドルの mousedown。React `handleOutlineResizeStart` 相当。 */
  onResizeStart?: (e: MouseEvent) => void;
  /** ←→ キーで幅変更要求（次の幅 px を通知）。React `setOutlineWidth` 相当。 */
  onWidthChange?: (next: number) => void;
  /** リサイズハンドルを隠す。 */
  hideResize?: boolean;
  /** 見出しの並べ替え確定（heading-only index の from → to）。 */
  onHeadingDragEnd?: (fromIdx: number, toIdx: number) => void;
  /** 行の削除。 */
  onOutlineDelete?: (pos: number, kind: string) => void;
  /** 章番号挿入。 */
  onInsertSectionNumbers?: () => void;
  /** 章番号除去。 */
  onRemoveSectionNumbers?: () => void;
  /** 幅の下限/上限（既定 150 / 500）。React のキーボード clamp と同値。 */
  widthMin?: number;
  widthMax?: number;
}

/** {@link createOutlinePanel} の戻り値。 */
export interface OutlinePanelHandle {
  /** root（Paper + resize handle を内包する wrapper）。呼び元が配置する。 */
  el: HTMLElement;
  /** 幅 / 高さ等の更新（再描画は不要なものは属性のみ書き換え）。 */
  update: (next: Partial<Pick<CreateOutlinePanelOptions, "outlineWidth" | "editorHeight">>) => void;
  /** editor 購読・listener・子コントロールを解放する。 */
  destroy: () => void;
}

const WIDTH_MIN_DEFAULT = 150;
const WIDTH_MAX_DEFAULT = 500;

/**
 * vanilla OutlinePanel を生成する。`el` を返すので呼び元が配置する。
 * 見出しは内部で集計し、editor の `update`/`transaction` で再描画する。
 */
export function createOutlinePanel(opts: CreateOutlinePanelOptions): OutlinePanelHandle {
  const { editor, t, onOutlineClick } = opts;
  const widthMin = opts.widthMin ?? WIDTH_MIN_DEFAULT;
  const widthMax = opts.widthMax ?? WIDTH_MAX_DEFAULT;

  let outlineWidth = opts.outlineWidth;
  let editorHeight = opts.editorHeight;
  let destroyed = false;

  // --- closure 状態（React useState 置換） ---
  let showBlocks = false;
  let dragIdx: number | null = null; // heading-only index
  let dropIdx: number | null = null; // heading-only index（末尾ゾーンは -1）
  const foldedIndices = new Set<number>(); // 折り畳まれた headingIndex の集合

  // 各再描画で再生成する子コントロール群（次回再描画 / destroy 前に解放）。
  let listHandles: Array<{ destroy: () => void }> = [];

  const releaseList = (): void => {
    for (const h of listHandles) h.destroy();
    listHandles = [];
  };

  // ---- Paper（outlined・navigation ロール）----
  const paper = createPaper({
    variant: "outlined",
    role: "navigation",
    ariaLabel: t("outlineNavigation"),
    style: {
      flex: "0 0 auto",
      borderTopLeftRadius: "0",
      borderTopRightRadius: "0",
      borderRight: "none",
      overflow: "auto",
      backgroundColor: "var(--am-color-bg-default)",
    },
  });
  const applyPaperSize = (): void => {
    paper.el.style.width = `${outlineWidth}px`;
    paper.el.style.minWidth = `${outlineWidth}px`;
    paper.el.style.maxWidth = `${outlineWidth}px`;
    paper.el.style.maxHeight = `${editorHeight}px`;
  };
  applyPaperSize();

  const inner = document.createElement("div");
  paper.el.appendChild(inner);

  // ---- ヘッダー（タイトル + アクション群）----
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;" +
    `padding-left:8px;padding-right:8px;min-height:${PANEL_HEADER_MIN_HEIGHT}px;` +
    "border-bottom:1px solid var(--am-color-divider);";
  const title = createText({
    variant: "subtitle2",
    component: "h2",
    text: t("outline"),
    style: "font-weight:700;flex:1;",
  });
  title.el.id = "outline-panel-title";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:2px;";
  header.append(title.el, actions);
  inner.appendChild(header);

  // body（項目 or 空メッセージ）。再描画で中身を入れ替える。
  const body = document.createElement("div");
  body.style.padding = "8px";
  inner.appendChild(body);

  // ヘッダーアクションのハンドル（destroy 時に解放）。
  const headerHandles: Array<{ destroy: () => void }> = [title];

  /** tooltip 付き IconButton を作り、headerHandles へ登録して返す。 */
  const tooltipIconButton = (config: {
    iconPath: string | readonly string[];
    ariaLabel: string;
    tooltip: string;
    onClick: () => void;
    color?: string;
    pressed?: boolean;
  }): HTMLElement => {
    const btn = createIconButton({
      size: "compact",
      ariaLabel: config.ariaLabel,
      children: svgIcon(config.iconPath, 16),
      onClick: config.onClick,
    });
    if (config.color) btn.el.style.color = config.color;
    if (config.pressed !== undefined) {
      btn.el.setAttribute("aria-pressed", String(config.pressed));
    }
    const tip = createTooltip({ reference: btn.el, title: config.tooltip });
    headerHandles.push(btn, tip);
    return btn.el;
  };

  // 章番号 挿入 / 除去（コールバック存在時のみ）。
  if (opts.onInsertSectionNumbers) {
    actions.appendChild(
      tooltipIconButton({
        iconPath: ICON_FORMAT_LIST_NUMBERED,
        ariaLabel: t("insertSectionNumbers"),
        tooltip: t("insertSectionNumbers"),
        onClick: opts.onInsertSectionNumbers,
      }),
    );
  }
  if (opts.onRemoveSectionNumbers) {
    actions.appendChild(
      tooltipIconButton({
        iconPath: ICON_FORMAT_LIST_BULLETED,
        ariaLabel: t("removeSectionNumbers"),
        tooltip: t("removeSectionNumbers"),
        onClick: opts.onRemoveSectionNumbers,
      }),
    );
  }

  // ブロック表示トグル。状態は showBlocks closure。
  const blockToggle = createIconButton({
    size: "compact",
    ariaLabel: t("outlineShowBlocks"),
    children: svgIcon(ICON_CATEGORY, 16),
    onClick: () => {
      showBlocks = !showBlocks;
      blockToggle.el.setAttribute("aria-pressed", String(showBlocks));
      blockToggle.el.style.color = showBlocks
        ? "var(--am-color-primary-main)"
        : "var(--am-color-text-secondary)";
      render();
    },
  });
  blockToggle.el.setAttribute("aria-pressed", "false");
  blockToggle.el.style.color = "var(--am-color-text-secondary)";
  const blockTip = createTooltip({ reference: blockToggle.el, title: t("outlineShowBlocks") });
  headerHandles.push(blockToggle, blockTip);
  actions.appendChild(blockToggle.el);

  // fold/unfold-all トグル（見出しがある時のみ表示）。aria-label/icon は fold 状態で切替。
  const foldAllBtn = createIconButton({
    size: "compact",
    ariaLabel: t("foldAll"),
    children: svgIcon(ICON_UNFOLD_LESS, 16),
    onClick: () => {
      if (foldedIndices.size > 0) {
        foldedIndices.clear();
      } else {
        for (const h of currentHeadings) {
          if (h.kind === "heading" && h.headingIndex !== undefined) {
            foldedIndices.add(h.headingIndex);
          }
        }
      }
      render();
    },
  });
  const foldAllTip = createTooltip({ reference: foldAllBtn.el, title: t("foldAll") });
  headerHandles.push(foldAllBtn, foldAllTip);
  actions.appendChild(foldAllBtn.el);

  // ---- 見出し集計（内部・extractHeadings） ----
  let currentHeadings: HeadingItem[] = [];

  /** heading-only index の配列（headings 配列の idx を並べる）。React headingOnlyIndices 相当。 */
  const computeHeadingOnlyIndices = (headings: HeadingItem[]): number[] =>
    headings.map((h, i) => (h.kind === "heading" ? i : -1)).filter((i) => i !== -1);

  /** arrIdx → heading-only idx の O(1) 逆引き Map。 */
  const buildHeadingOnlyMap = (hoIndices: number[]): Map<number, number> => {
    const map = new Map<number, number>();
    hoIndices.forEach((arrIdx, hoIdx) => map.set(arrIdx, hoIdx));
    return map;
  };

  /**
   * fold で隠れる項目（headings 配列 idx の集合）を求める。React の hiddenByFold 相当ロジック。
   * 折り畳まれた heading の配下（次の同レベル以上の heading まで）を hidden にする。
   */
  const computeHiddenByFold = (headings: HeadingItem[]): Set<number> => {
    const hidden = new Set<number>();
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      if (h.kind !== "heading" || h.headingIndex === undefined) continue;
      if (!foldedIndices.has(h.headingIndex)) continue;
      // この heading の配下を hidden にする（次の level <= h.level の heading まで）。
      for (let j = i + 1; j < headings.length; j++) {
        const next = headings[j];
        if (next.kind === "heading" && next.level <= h.level) break;
        hidden.add(j);
      }
    }
    return hidden;
  };

  // ---- drag handlers（React useCallback 置換） ----
  let toHeadingOnlyIdx = (_arrIdx: number): number => -1;

  const handleDragStart = (e: DragEvent, idx: number): void => {
    const hoIdx = toHeadingOnlyIdx(idx);
    if (hoIdx === -1) return;
    dragIdx = hoIdx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(hoIdx));
    }
  };

  const handleDragOver = (e: DragEvent, idx: number): void => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const hoIdx = toHeadingOnlyIdx(idx);
    const nextDrop = hoIdx === -1 || hoIdx === dragIdx ? null : hoIdx;
    if (nextDrop !== dropIdx) {
      dropIdx = nextDrop;
      render();
    }
  };

  const handleDrop = (e: DragEvent, idx: number): void => {
    e.preventDefault();
    const fromIdx = dragIdx;
    const toIdx = idx === -1 ? -1 : toHeadingOnlyIdx(idx);
    dragIdx = null;
    dropIdx = null;
    render();
    if (fromIdx === null || toIdx === fromIdx) return;
    opts.onHeadingDragEnd?.(fromIdx, toIdx);
  };

  const handleDragEnd = (): void => {
    if (dragIdx === null && dropIdx === null) return;
    dragIdx = null;
    dropIdx = null;
    render();
  };

  /** Alt+Arrow による並べ替え（React handleHeadingKeyDown 相当）。 */
  const handleHeadingKeyDown = (e: KeyboardEvent, hoIdx: number, hoCount: number): void => {
    if (!opts.onHeadingDragEnd || !e.altKey) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const targetIdx = e.key === "ArrowUp" ? hoIdx - 1 : hoIdx + 1;
    if (targetIdx >= 0 && targetIdx < hoCount) {
      opts.onHeadingDragEnd(hoIdx, targetIdx);
    }
  };

  /** 個別行（heading or block）を生成する。listHandles へ子ハンドルを登録。 */
  const buildItem = (config: {
    h: HeadingItem;
    idx: number;
    hoIdx: number;
    hoCount: number;
    isFolded: boolean;
    isDragging: boolean;
    isDropTarget: boolean;
    blockPl: number;
  }): HTMLElement => {
    const { h, idx, hoIdx, hoCount, isFolded, isDragging, isDropTarget, blockPl } = config;
    const isHeading = h.kind === "heading";
    const isDraggable = isHeading && !!opts.onHeadingDragEnd;
    const plValue = isHeading ? (h.level - 1) * 1.5 * 8 : blockPl * 8;

    const row = document.createElement("div");
    row.className = "am-outline-item";
    row.style.cssText =
      "display:flex;align-items:center;border-radius:2px;" +
      `padding-left:${plValue}px;padding-top:2px;padding-bottom:2px;` +
      `opacity:${isDragging ? "0.4" : "1"};` +
      `border-top:2px solid ${isDropTarget ? "var(--am-color-primary-main)" : "transparent"};` +
      (isDraggable ? "cursor:grab;" : "");

    if (isDraggable) {
      row.draggable = true;
      const onDragStart = (e: DragEvent): void => handleDragStart(e, idx);
      const onDragOver = (e: DragEvent): void => handleDragOver(e, idx);
      const onDrop = (e: DragEvent): void => handleDrop(e, idx);
      row.addEventListener("dragstart", onDragStart);
      row.addEventListener("dragover", onDragOver);
      row.addEventListener("drop", onDrop);
      row.addEventListener("dragend", handleDragEnd);
      listHandles.push({
        destroy() {
          row.removeEventListener("dragstart", onDragStart);
          row.removeEventListener("dragover", onDragOver);
          row.removeEventListener("drop", onDrop);
          row.removeEventListener("dragend", handleDragEnd);
        },
      });
    }

    // 左端: 折り畳みボタン（heading）or ブロックアイコン（非 heading）。
    if (isHeading) {
      const headingIndex = h.headingIndex ?? -1;
      const arrow = svgIcon(ICON_KEYBOARD_ARROW_DOWN, 16);
      arrow.style.transition = "transform 0.15s";
      arrow.style.transform = isFolded ? "rotate(-90deg)" : "rotate(0deg)";
      const foldBtn = createIconButton({
        size: "compact",
        ariaLabel: `${isFolded ? t("expandSection") : t("collapseSection")} ${h.text || "(empty)"}`,
        children: arrow,
        onClick: (e) => {
          e.stopPropagation();
          if (foldedIndices.has(headingIndex)) foldedIndices.delete(headingIndex);
          else foldedIndices.add(headingIndex);
          render();
        },
      });
      foldBtn.el.setAttribute("aria-expanded", String(!isFolded));
      foldBtn.el.style.color = "var(--am-color-text-secondary)";
      foldBtn.el.style.marginRight = "2px";
      foldBtn.el.style.flexShrink = "0";
      listHandles.push(foldBtn);
      row.appendChild(foldBtn.el);
    } else {
      const iconWrap = document.createElement("div");
      iconWrap.style.cssText =
        "display:flex;align-items:center;margin-right:4px;flex-shrink:0;" +
        "color:var(--am-color-text-disabled);";
      iconWrap.appendChild(blockIconSvg(h.kind as Exclude<OutlineKind, "heading">));
      row.appendChild(iconWrap);
    }

    // クリック可能ラベル（ButtonBase component="div" 相当）。
    const label = document.createElement("div");
    label.setAttribute("role", "button");
    label.setAttribute("tabindex", "0");
    label.style.cssText =
      "display:inline-flex;align-items:center;flex:1;min-width:0;font-weight:400;" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:2px;" +
      "justify-content:flex-start;cursor:pointer;" +
      `font-size:${OUTLINE_FONT_SIZE};` +
      `color:${isFolded ? "var(--am-color-text-disabled)" : "var(--am-color-text-primary)"};`;
    label.textContent = h.text || "(empty)";
    if (isDraggable) label.setAttribute("aria-roledescription", t("draggableHeading"));
    const onLabelClick = (): void => onOutlineClick(h.pos);
    const onLabelKey = (e: KeyboardEvent): void => {
      if ((e.key === "Enter" || e.key === " ") && e.target === label && !e.altKey) {
        e.preventDefault();
        onOutlineClick(h.pos);
        return;
      }
      handleHeadingKeyDown(e, hoIdx, hoCount);
    };
    label.addEventListener("click", onLabelClick);
    label.addEventListener("keydown", onLabelKey);
    listHandles.push({
      destroy() {
        label.removeEventListener("click", onLabelClick);
        label.removeEventListener("keydown", onLabelKey);
      },
    });
    row.appendChild(label);

    // 右端: 削除ボタン（hover/focus-within で表示・CSS 注入で制御）。
    const moveBtns = document.createElement("div");
    moveBtns.className = "am-outline-move-btns";
    moveBtns.style.cssText = "display:flex;flex-shrink:0;transition:opacity 0.15s;opacity:0;";
    if (opts.onOutlineDelete) {
      const onOutlineDelete = opts.onOutlineDelete;
      const delBtn = createIconButton({
        size: "compact",
        ariaLabel: `${t("delete")} ${h.text || ""}`,
        children: svgIcon(ICON_DELETE_OUTLINE, 14),
        onClick: (e) => {
          e.stopPropagation();
          onOutlineDelete(h.pos, h.kind);
        },
      });
      const delTip = createTooltip({ reference: delBtn.el, title: t("delete"), placement: "top" });
      listHandles.push(delBtn, delTip);
      moveBtns.appendChild(delBtn.el);
    }
    row.appendChild(moveBtns);

    return row;
  };

  /** body を再構築する（React render 相当の手続き版）。 */
  const render = (): void => {
    if (destroyed) return;
    releaseList();
    body.replaceChildren();

    const headings = currentHeadings;
    const hoIndices = computeHeadingOnlyIndices(headings);
    const hoMap = buildHeadingOnlyMap(hoIndices);
    toHeadingOnlyIdx = (arrIdx) => hoMap.get(arrIdx) ?? -1;
    const hoCount = hoIndices.length;

    // fold/unfold-all ボタンの表示と icon/label を heading の有無 + fold 状態で更新。
    if (hoCount > 0) {
      foldAllBtn.el.style.display = "";
      const someFolded = foldedIndices.size > 0;
      foldAllBtn.update({
        ariaLabel: someFolded ? t("unfoldAll") : t("foldAll"),
        children: svgIcon(someFolded ? ICON_UNFOLD_MORE : ICON_UNFOLD_LESS, 16),
      });
      foldAllTip.update({ title: someFolded ? t("unfoldAll") : t("foldAll") });
    } else {
      foldAllBtn.el.style.display = "none";
    }

    if (headings.length === 0) {
      const empty = createText({
        variant: "body2",
        text: t("noHeadings"),
        style: `color:var(--am-color-text-disabled);font-size:${OUTLINE_FONT_SIZE};`,
      });
      listHandles.push(empty);
      body.appendChild(empty.el);
      return;
    }

    const hiddenByFold = computeHiddenByFold(headings);

    headings.forEach((h, idx) => {
      const isHeading = h.kind === "heading";
      const isHidden = hiddenByFold.has(idx) || (!isHeading && !showBlocks);
      const isFolded = isHeading && foldedIndices.has(h.headingIndex ?? -1);
      const hoIdx = isHeading ? toHeadingOnlyIdx(idx) : -1;
      const isDragging = isHeading && hoIdx === dragIdx;
      const isDropTarget = isHeading && hoIdx === dropIdx && hoIdx !== dragIdx;
      const blockPl = isHeading ? 0 : computeBlockPadding(idx, headings);

      const item = buildItem({ h, idx, hoIdx, hoCount, isFolded, isDragging, isDropTarget, blockPl });
      const collapse = createCollapse({ in: !isHidden, unmountOnExit: true, timeout: 150, children: item });
      listHandles.push(collapse);
      body.appendChild(collapse.el);
    });

    // 末尾ドロップゾーン。
    const dropZone = document.createElement("div");
    dropZone.style.cssText =
      "height:16px;" +
      `border-top:2px solid ${dropIdx === -1 && dragIdx !== null ? "var(--am-color-primary-main)" : "transparent"};`;
    const onZoneOver = (e: DragEvent): void => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (dragIdx !== null && dropIdx !== -1) {
        dropIdx = -1;
        render();
      }
    };
    const onZoneDrop = (e: DragEvent): void => handleDrop(e, -1);
    dropZone.addEventListener("dragover", onZoneOver);
    dropZone.addEventListener("drop", onZoneDrop);
    listHandles.push({
      destroy() {
        dropZone.removeEventListener("dragover", onZoneOver);
        dropZone.removeEventListener("drop", onZoneDrop);
      },
    });
    body.appendChild(dropZone);
  };

  // hover で削除ボタンを出すための共有スタイル（CSS module の :hover / :focus-within 相当）。
  ensureOutlineStyles();

  // ---- editor 購読（見出し再集計 → render）----
  const refresh = (): void => {
    currentHeadings = extractHeadings(editor);
    // fold 集合から、もう存在しない headingIndex を掃除する（並べ替え/削除で index がズレるため）。
    const validIndices = new Set<number>();
    for (const h of currentHeadings) {
      if (h.kind === "heading" && h.headingIndex !== undefined) validIndices.add(h.headingIndex);
    }
    for (const fi of [...foldedIndices]) {
      if (!validIndices.has(fi)) foldedIndices.delete(fi);
    }
    render();
  };
  editor.on("update", refresh);
  editor.on("transaction", refresh);
  refresh();

  // ---- リサイズハンドル ----
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;";
  wrapper.appendChild(paper.el);

  let resizeHandle: HTMLElement | null = null;
  let onHandleMouseDown: ((e: MouseEvent) => void) | null = null;
  let onHandleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  if (!opts.hideResize) {
    resizeHandle = document.createElement("div");
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("tabindex", "0");
    resizeHandle.setAttribute("aria-orientation", "vertical");
    resizeHandle.setAttribute("aria-label", t("resizeOutlinePanel"));
    resizeHandle.setAttribute("aria-valuenow", String(outlineWidth));
    resizeHandle.setAttribute("aria-valuemin", String(widthMin));
    resizeHandle.setAttribute("aria-valuemax", String(widthMax));
    resizeHandle.className = "am-outline-resize-handle";
    resizeHandle.style.cssText =
      "width:6px;cursor:col-resize;flex-shrink:0;display:flex;align-items:center;justify-content:center;";
    onHandleMouseDown = (e: MouseEvent): void => {
      opts.onResizeStart?.(e);
    };
    onHandleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        opts.onWidthChange?.(Math.min(widthMax, outlineWidth + 20));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        opts.onWidthChange?.(Math.max(widthMin, outlineWidth - 20));
      }
    };
    resizeHandle.addEventListener("mousedown", onHandleMouseDown);
    resizeHandle.addEventListener("keydown", onHandleKeyDown);
    wrapper.appendChild(resizeHandle);
  }

  return {
    el: wrapper,
    update(next) {
      if (next.outlineWidth !== undefined) {
        outlineWidth = next.outlineWidth;
        resizeHandle?.setAttribute("aria-valuenow", String(outlineWidth));
      }
      if (next.editorHeight !== undefined) editorHeight = next.editorHeight;
      applyPaperSize();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      editor.off("update", refresh);
      editor.off("transaction", refresh);
      releaseList();
      for (const h of headerHandles) h.destroy();
      if (resizeHandle && onHandleMouseDown) {
        resizeHandle.removeEventListener("mousedown", onHandleMouseDown);
      }
      if (resizeHandle && onHandleKeyDown) {
        resizeHandle.removeEventListener("keydown", onHandleKeyDown);
      }
    },
  };
}

/** hover/focus-within で削除ボタンを出す共有スタイルを document.head へ 1 度だけ注入する。 */
const OUTLINE_STYLE_ID = "am-outline-panel-styles";
function ensureOutlineStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(OUTLINE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = OUTLINE_STYLE_ID;
  style.textContent =
    ".am-outline-item:hover{background-color:var(--am-color-action-hover);}" +
    ".am-outline-item:hover .am-outline-move-btns," +
    ".am-outline-item .am-outline-move-btns:focus-within{opacity:1;}" +
    ".am-outline-resize-handle:hover{background-color:var(--am-color-action-hover);}" +
    ".am-outline-resize-handle:focus-visible{outline:2px solid var(--am-color-primary-main);}" +
    ".am-outline-resize-handle::after{content:'';width:2px;height:32px;border-radius:4px;" +
    "background-color:var(--am-color-divider);}" +
    "@media (prefers-reduced-motion: reduce){" +
    ".am-outline-move-btns{transition:none;}}";
  document.head.appendChild(style);
}
