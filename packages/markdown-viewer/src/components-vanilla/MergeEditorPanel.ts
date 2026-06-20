/**
 * 脱React の vanilla DOM「MergeEditorPanel」ファクトリ
 * （framework-decoupling Phase 3 / D・追加のみ・本番未配線）。
 *
 * React 原版 `components/MergeEditorPanel.tsx`（GlobalStyle + IconButton + Tooltip 消費・最大 679 行）の
 * 素 DOM 版。diff / merge の左右ペインを構成する。2 モードを持つ:
 *
 * 1. ソースモード（sourceMode: true）: textarea + 行番号ガター + 折り返し対応の行単位 diff 背景
 *    （ミラー div）+ マージ方向ボタン（Tooltip + IconButton のマージガター）+ 未変更セクションの
 *    折りたたみ/展開。ミラーで各行の描画高さを ResizeObserver で計測し、ガター/マージガターの行高さを同期する。
 * 2. WYSIWYG モード（sourceMode: false）: editor をマウントする Paper。比較固有の tiptap スタイル
 *    （getMergeTiptapStyles 由来の実 CSS）を opts.tiptapCss で受け、ensureStyle でスコープ付き `<style>` を
 *    1 度だけ注入する（React 版の GlobalStyle 置換）。
 *
 * 変換規約:
 * - React props → opts（editor / t / コールバック / flag / 初期状態）。戻り値は { el, update, destroy }。
 *   パネル系のため self-append せず el を返す（呼び元が配置）。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。React 原版が
 *   getSuccessMain(isDark) / getErrorMain(isDark) / getActionHover(isDark) / getTextSecondary(isDark) /
 *   getTextPrimary(isDark) で当てていた diff 背景・ガター色・テキスト色は `--am-color-success-main` /
 *   `--am-color-error-main` / `--am-color-action-hover` / `--am-color-text-secondary` /
 *   `--am-color-text-primary` を `color-mix` で透過した値に置換する（diffLineBgColor 相当）。
 * - `useMarkdownT` → opts.t。`useEditorSettingsContext` → opts.editorSettings（fontSize / lineHeight）。
 * - useState/useEffect/useRef → closure 変数 + 明示的 addEventListener/removeEventListener + ResizeObserver。
 *   cleanup（textarea scroll listener / ResizeObserver / Tooltip / IconButton）は destroy で解除する。
 *
 * 移植範囲（partial）:
 * - ソースモードの diff/merge コア構造（ガター・ミラー背景・マージボタン・折りたたみ/展開・行高さ同期）を
 *   素 DOM へ全面移植した。
 * - WYSIWYG モードは editor のマウント + tiptap CSS 注入のみを移植する。React 版の getMergeTiptapStyles は
 *   MUI sx オブジェクト（ネストセレクタ）を返すため、その sx→CSS シリアライズは本ファイルの責務外とし、
 *   呼び元が実 CSS 文字列 opts.tiptapCss を渡す（GlobalStyle 経由注入の置換）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";
import {
  type CollapseRegion,
  computeCollapsedRegions,
  type DiffLine,
} from "@anytime-markdown/markdown-engine";

import type { TranslationFn } from "../types";
import { createIconButton, createTooltip, ensureStyle, svgIcon } from "@anytime-markdown/graph-core/ui-vanilla";

// ui/icons.tsx と同一の Material SVG path（ChevronLeft / ChevronRight / UnfoldMore）。
const ICON_CHEVRON_LEFT = "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z";
const ICON_CHEVRON_RIGHT = "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z";
const ICON_UNFOLD_MORE =
  "M12 5.83 15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15z";

/** SourceSegment の textarea / scrollbar 用の pseudo-class CSS（MergeEditorPanel.module.css 置換）。 */
const STYLE_ID = "am-vanilla-merge-editor-panel";
const PANEL_CSS =
  ".am-merge-textarea{position:relative;z-index:1;width:100%;min-height:100%;border:none;outline:none;" +
  "box-shadow:none;resize:none;font-family:monospace;box-sizing:border-box;background-color:transparent;}" +
  ".am-merge-textarea:focus{border:none;outline:none;box-shadow:none;}" +
  ".am-merge-textarea-hide-scrollbar{scrollbar-width:none;-ms-overflow-style:none;}" +
  ".am-merge-textarea-hide-scrollbar::-webkit-scrollbar{display:none;}" +
  ".am-merge-textarea-overflow-hidden{overflow:hidden;}";

/**
 * diff 行種別 1 件に対応する背景色（diffLineBgColor 相当・vanilla 版）。
 * 追加/変更後=緑 18%、削除/変更前=赤 18%、それ以外=透明。CSS 変数 + color-mix で透過する
 * （isDark 分岐は --am-color-* が担うため不要）。
 */
function lineBgColor(type: DiffLine["type"] | undefined): string {
  switch (type) {
    case "added":
    case "modified-new":
      return "color-mix(in srgb, var(--am-color-success-main) 18%, transparent)";
    case "removed":
    case "modified-old":
      return "color-mix(in srgb, var(--am-color-error-main) 18%, transparent)";
    default:
      return "transparent";
  }
}

/** {@link createMergeEditorPanel} のオプション（React `MergeEditorPanelProps` の vanilla 置換）。 */
export interface CreateMergeEditorPanelOptions {
  /** i18n。 */
  t: TranslationFn;
  /** エディタ設定（fontSize / lineHeight）。React `useEditorSettingsContext` 相当。 */
  editorSettings: { fontSize: number; lineHeight: number };
  /** ソースモード（textarea 編集）か WYSIWYG（editor マウント）か。 */
  sourceMode: boolean;

  // --- ソースモード ---
  /** ソースモード時の生テキスト。 */
  sourceText?: string;
  /** テキスト変更（実テキストの差分を除いた値）。React `onSourceChange` 相当。 */
  onSourceChange?: (value: string) => void;
  /** textarea を自動リサイズする（スクロールでなく高さ伸長）。 */
  autoResize?: boolean;
  /** textarea の aria-label。 */
  textareaAriaLabel?: string;
  /** スクロールバーを隠す。 */
  hideScrollbar?: boolean;
  /** diff 行（アライン済み）。未指定時は全行 equal として描画する。 */
  diffLines?: DiffLine[];
  /** 左右どちらのペインか（マージボタンの向きを決める）。 */
  side?: "left" | "right";
  /** 読み取り専用（textarea readonly）。 */
  readOnly?: boolean;
  /** マージ操作（ブロック単位）。React `onMerge` 相当。 */
  onMerge?: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  /** カーソル行ホバー通知。React `onHoverLine` 相当。 */
  onHoverLine?: (lineIndex: number | null) => void;
  /** 未変更セクション折りたたみ ON/OFF。 */
  collapse?: boolean;
  /** 折りたたみ時に変更前後に残す行数（既定 3）。 */
  contextLines?: number;
  /** 手動展開済み collapsed 領域の startIdx 集合。 */
  expandedStarts?: Set<number>;
  /** collapsed 領域の展開トグル。React `onToggleExpand` 相当。 */
  onToggleExpand?: (startIdx: number) => void;

  // --- WYSIWYG モード ---
  /** マウントする TipTap エディタ。editor.options.element を root へ移設する。 */
  editor?: Editor | null;
  /**
   * 比較固有の tiptap 実 CSS（getMergeTiptapStyles の sx→CSS シリアライズ結果）。
   * `.<scopeClass> .tiptap{...}` 形式で呼び元が渡す。React 版 GlobalStyle の置換。
   */
  tiptapCss?: string;
}

/** {@link createMergeEditorPanel} の戻り値。 */
export interface MergeEditorPanelHandle {
  /** root（Paper コンテナ。呼び元が配置する）。 */
  el: HTMLElement;
  /** 状態（sourceText / diffLines / collapse / expandedStarts 等）を反映して再描画する。 */
  update: (next: Partial<CreateMergeEditorPanelOptions>) => void;
  /** textarea listener / ResizeObserver / Tooltip / IconButton / editor マウントを解放する。 */
  destroy: () => void;
}

/** 表示テキストと padding 行 index 集合を diffLines から組み立てる（React buildDisplayText 同等）。 */
function buildDisplayText(
  diffLines: DiffLine[],
  rawText: string,
): { displayText: string; paddingIndices: Set<number> } {
  const displayLines: string[] = [];
  const paddingIndices = new Set<number>();
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type === "padding") {
      displayLines.push("");
      paddingIndices.add(i);
    } else {
      displayLines.push(diffLines[i].text);
    }
  }
  let displayText = displayLines.join("\n");
  if (rawText.endsWith("\n") && !displayText.endsWith("\n")) displayText += "\n";
  return { displayText, paddingIndices };
}

/** マージボタン map: diffLines index -> blockId（各 diff ブロックの先頭行のみ）。React buildMergeButtonMap 同等。 */
function buildMergeButtonMap(diffLines: DiffLine[]): Map<number, number> {
  const map = new Map<number, number>();
  const rendered = new Set<number>();
  for (let i = 0; i < diffLines.length; i++) {
    const dl = diffLines[i];
    if (dl.blockId !== null && dl.type !== "equal" && dl.type !== "padding" && !rendered.has(dl.blockId)) {
      rendered.add(dl.blockId);
      map.set(i, dl.blockId);
    }
  }
  return map;
}

/** collapsed 領域を考慮した実テキスト行範囲を求める（React realLineRanges 同等）。 */
function realLineRanges(
  diffLines: DiffLine[],
  regions: CollapseRegion[],
): { start: number; end: number }[] {
  const prefix = new Array<number>(diffLines.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < diffLines.length; i++) {
    prefix[i + 1] = prefix[i] + (diffLines[i].lineNumber !== null ? 1 : 0);
  }
  return regions.map((r) => ({ start: prefix[r.startIdx], end: prefix[r.endIdx] }));
}

/** diffLines 未指定時の effective lines（全行 equal）を作る。 */
function toEffectiveLines(diffLines: DiffLine[] | undefined, rawText: string): DiffLine[] {
  if (diffLines) return diffLines;
  if (rawText === "") return [];
  return rawText.split("\n").map((text, i) => ({
    text,
    type: "equal" as const,
    blockId: null,
    lineNumber: i + 1,
  }));
}

/** マージガターの 1 セル（Tooltip + IconButton）。blockId が null なら空セル。 */
interface MergeCellHandle {
  el: HTMLElement;
  destroy: () => void;
}

function createMergeCell(opts: {
  blockId: number | null;
  panelSide: "left" | "right";
  fontSize: number;
  lineHeight: number;
  onMerge: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  t: TranslationFn;
}): MergeCellHandle {
  const { blockId, panelSide, fontSize, lineHeight, onMerge, t } = opts;
  const cell = document.createElement("div");
  cell.style.cssText =
    `position:relative;font-family:monospace;font-size:${fontSize}px;` +
    `line-height:${lineHeight};text-align:center;`;
  cell.textContent = " ";

  if (blockId == null) {
    return { el: cell, destroy: () => {} };
  }

  const label = panelSide === "left" ? t("mergeLeftToRight") : t("mergeRightToLeft");
  const direction = panelSide === "left" ? ("left-to-right" as const) : ("right-to-left" as const);

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;top:0;left:0;right:0;bottom:0;display:flex;" +
    "align-items:center;justify-content:center;";
  const iconPath = panelSide === "left" ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_LEFT;
  const btn = createIconButton({
    size: "small",
    ariaLabel: label,
    children: svgIcon(iconPath, 16),
    onClick: () => onMerge(blockId, direction),
  });
  btn.el.style.padding = "0";
  overlay.appendChild(btn.el);
  cell.appendChild(overlay);

  const tooltip = createTooltip({
    reference: btn.el,
    title: label,
    placement: panelSide === "left" ? "left" : "right",
  });

  return {
    el: cell,
    destroy() {
      tooltip.destroy();
      btn.destroy();
    },
  };
}

/** マージガター列（方向ボタンの縦並び）。 */
interface MergeGutterHandle {
  el: HTMLElement;
  destroy: () => void;
}

function createMergeGutter(opts: {
  panelSide: "left" | "right";
  alignedCount: number;
  mergeButtonIndices: Map<number, number>;
  fontSize: number;
  lineHeight: number;
  onMerge: (blockId: number, direction: "left-to-right" | "right-to-left") => void;
  t: TranslationFn;
}): MergeGutterHandle {
  const gutter = document.createElement("div");
  gutter.style.cssText =
    "width:24px;min-width:24px;padding-top:16px;padding-bottom:16px;margin:0;" +
    "overflow:hidden;flex-shrink:0;";
  const cells: MergeCellHandle[] = [];
  for (let i = 0; i < opts.alignedCount; i++) {
    const cell = createMergeCell({
      blockId: opts.mergeButtonIndices.get(i) ?? null,
      panelSide: opts.panelSide,
      fontSize: opts.fontSize,
      lineHeight: opts.lineHeight,
      onMerge: opts.onMerge,
      t: opts.t,
    });
    cells.push(cell);
    gutter.appendChild(cell.el);
  }
  return {
    el: gutter,
    destroy() {
      for (const c of cells) c.destroy();
    },
  };
}

/** 折りたたみ展開ボタン行（collapsed 領域の代替）。hover は closure + mouseenter/leave で再現。 */
interface ExpanderHandle {
  el: HTMLElement;
  destroy: () => void;
}

function createExpanderRow(opts: {
  count: number;
  fontSize: number;
  lineHeight: number;
  onClick: () => void;
  t: TranslationFn;
}): ExpanderHandle {
  const { count, fontSize, lineHeight, onClick, t } = opts;
  const label = t("expandLines", { count });
  const row = document.createElement("div");
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");
  row.setAttribute("aria-label", label);
  const baseBg = "color-mix(in srgb, var(--am-color-action-hover) 4%, transparent)";
  const hoverBg = "color-mix(in srgb, var(--am-color-action-hover) 10%, transparent)";
  const dashed = "1px dashed color-mix(in srgb, var(--am-color-text-secondary) 25%, transparent)";
  row.style.cssText =
    `display:flex;align-items:center;gap:8px;cursor:pointer;padding-left:16px;padding-right:16px;` +
    `padding-top:4px;padding-bottom:4px;font-family:monospace;font-size:${fontSize}px;` +
    `line-height:${lineHeight};color:color-mix(in srgb, var(--am-color-text-secondary) 80%, transparent);` +
    `background-color:${baseBg};border-top:${dashed};border-bottom:${dashed};user-select:none;`;

  const icon = svgIcon(ICON_UNFOLD_MORE, 16);
  const text = document.createElement("span");
  text.textContent = label;
  row.append(icon, text);

  const onEnter = (): void => {
    row.style.backgroundColor = hoverBg;
  };
  const onLeave = (): void => {
    row.style.backgroundColor = baseBg;
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  row.addEventListener("mouseenter", onEnter);
  row.addEventListener("mouseleave", onLeave);
  row.addEventListener("click", onClick);
  row.addEventListener("keydown", onKeyDown);

  return {
    el: row,
    destroy() {
      row.removeEventListener("mouseenter", onEnter);
      row.removeEventListener("mouseleave", onLeave);
      row.removeEventListener("click", onClick);
      row.removeEventListener("keydown", onKeyDown);
    },
  };
}

/** ソースモードの 1 セグメント（diffLines スライス）。ガター・ミラー・textarea・マージガター・行高さ同期を内包する。 */
interface SourceSegmentHandle {
  el: HTMLElement;
  textarea: HTMLTextAreaElement;
  destroy: () => void;
}

function createSourceSegment(opts: {
  diffLines: DiffLine[];
  /**
   * セグメントが表す実ソーステキスト。buildDisplayText の末尾改行補償
   * （diff 側で pop された "\n" 終端の復元）に使う。collapse 分割セグメントでは
   * 部分テキストに改行を付加してはいけないため空文字を渡す。
   */
  rawText: string;
  baseAlignedIdx: number;
  side: "left" | "right" | undefined;
  readOnly: boolean | undefined;
  autoResize: boolean | undefined;
  textareaAriaLabel: string | undefined;
  onSliceChange: ((value: string) => void) | undefined;
  onMerge: ((blockId: number, direction: "left-to-right" | "right-to-left") => void) | undefined;
  onHoverLine: ((lineIndex: number | null) => void) | undefined;
  fontSize: number;
  lineHeight: number;
  digits: number;
  hideScrollbar: boolean;
  t: TranslationFn;
}): SourceSegmentHandle {
  const {
    diffLines, rawText, baseAlignedIdx, side, readOnly, autoResize, textareaAriaLabel,
    onSliceChange, onMerge, onHoverLine, fontSize, lineHeight, digits, hideScrollbar, t,
  } = opts;

  const { displayText, paddingIndices } = buildDisplayText(diffLines, rawText);
  const alignedCount = diffLines.length;
  const lineNumbersArray = diffLines.map((dl) => (dl.lineNumber == null ? "" : String(dl.lineNumber)));
  const displayLines = displayText.split("\n");
  const mergeButtonIndices = side && onMerge ? buildMergeButtonMap(diffLines) : new Map<number, number>();
  const hasMergeButtons = mergeButtonIndices.size > 0 && !!side && !!onMerge;

  const childHandles: Array<{ destroy: () => void }> = [];
  const root = document.createElement("div");
  root.style.display = "flex";

  // --- 右ペインのマージガター（左側に配置） ---
  let mergeGutterEl: HTMLElement | null = null;
  if (side === "right" && hasMergeButtons) {
    const mg = createMergeGutter({
      panelSide: "right", alignedCount, mergeButtonIndices, fontSize, lineHeight, onMerge, t,
    });
    childHandles.push(mg);
    mergeGutterEl = mg.el;
    root.appendChild(mg.el);
  }

  // --- 行番号ガター ---
  const gutterWidth = `${Math.max(3, digits + 1)}ch`;
  const gutter = document.createElement("div");
  gutter.style.cssText =
    `width:${gutterWidth};min-width:${gutterWidth};padding-top:16px;padding-bottom:16px;` +
    `padding-left:8px;padding-right:8px;margin:0;text-align:right;font-family:monospace;` +
    `font-size:${fontSize}px;line-height:${lineHeight};` +
    `color:color-mix(in srgb, var(--am-color-text-secondary) 60%, transparent);` +
    `user-select:none;overflow:hidden;box-sizing:border-box;flex-shrink:0;`;
  for (let i = 0; i < lineNumbersArray.length; i++) {
    const num = lineNumbersArray[i];
    const lineEl = document.createElement("div");
    const navBlockId = mergeButtonIndices.get(i);
    if (navBlockId !== undefined) lineEl.setAttribute("data-diff-block-id", String(navBlockId));
    lineEl.textContent = num || " ";
    gutter.appendChild(lineEl);
  }
  root.appendChild(gutter);

  // --- テキストコンテナ（ミラー背景 + textarea） ---
  const textContainer = document.createElement("div");
  textContainer.style.cssText = "flex:1;min-width:0;position:relative;";

  const mirrorPadRight = side === "left" && hasMergeButtons ? "0" : "16px";
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.cssText =
    `position:absolute;top:0;left:0;right:0;z-index:0;pointer-events:none;color:transparent;` +
    `font-family:monospace;font-size:${fontSize}px;line-height:${lineHeight};white-space:pre-wrap;` +
    `overflow-wrap:break-word;padding-top:16px;padding-bottom:16px;padding-right:${mirrorPadRight};` +
    `padding-left:8px;box-sizing:border-box;`;
  for (let i = 0; i < displayLines.length; i++) {
    const line = displayLines[i];
    const lineEl = document.createElement("div");
    lineEl.style.backgroundColor = lineBgColor(diffLines[i]?.type ?? "equal");
    lineEl.textContent = line || " ";
    mirror.appendChild(lineEl);
  }
  textContainer.appendChild(mirror);

  const textarea = document.createElement("textarea");
  const taClass = [
    "am-merge-textarea",
    hideScrollbar ? "am-merge-textarea-hide-scrollbar" : null,
    autoResize ? "am-merge-textarea-overflow-hidden" : null,
  ].filter(Boolean).join(" ");
  textarea.className = taClass;
  if (textareaAriaLabel !== undefined) textarea.setAttribute("aria-label", textareaAriaLabel);
  textarea.readOnly = !!readOnly;
  textarea.value = displayText;
  textarea.style.cssText =
    `padding-top:16px;padding-bottom:16px;padding-right:${mirrorPadRight};padding-left:8px;` +
    `font-size:${fontSize}px;line-height:${lineHeight};color:var(--am-color-text-primary);`;

  const onInput = (): void => {
    const newText = textarea.value;
    if (paddingIndices.size === 0) {
      onSliceChange?.(newText);
      return;
    }
    const lines = newText.split("\n");
    const realLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (paddingIndices.has(i) && lines[i] === "") continue;
      realLines.push(lines[i]);
    }
    onSliceChange?.(realLines.join("\n"));
  };
  const onSelect = (): void => {
    if (!onHoverLine) return;
    const pos = textarea.selectionStart ?? 0;
    const lineIdx = (textarea.value.slice(0, pos).match(/\n/g) || []).length;
    onHoverLine(lineIdx < diffLines.length ? baseAlignedIdx + lineIdx : null);
  };
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("select", onSelect);
  textContainer.appendChild(textarea);
  root.appendChild(textContainer);

  // --- 左ペインのマージガター（右側に配置） ---
  if (side === "left" && hasMergeButtons) {
    const mg = createMergeGutter({
      panelSide: "left", alignedCount, mergeButtonIndices, fontSize, lineHeight, onMerge, t,
    });
    childHandles.push(mg);
    mergeGutterEl = mg.el;
    root.appendChild(mg.el);
  }

  // --- textarea 自動リサイズ（autoResize 時のみ） ---
  if (autoResize) {
    textarea.style.height = "auto";
    // jsdom では scrollHeight が 0 になることがあるが、ブラウザでは実高さに伸長する。
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  // --- ガターのスクロール同期（非 autoResize 時のみ） ---
  let onScroll: (() => void) | null = null;
  if (!autoResize) {
    onScroll = (): void => {
      gutter.scrollTop = textarea.scrollTop;
      if (mergeGutterEl) mergeGutterEl.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", onScroll);
  }

  // --- ミラーで各行の描画高さを計測し、行番号・マージボタンの高さへ反映 ---
  const applyHeights = (): void => {
    for (let i = 0; i < mirror.children.length; i++) {
      const h = (mirror.children[i] as HTMLElement).getBoundingClientRect().height;
      if (i < gutter.children.length) {
        (gutter.children[i] as HTMLElement).style.height = `${h}px`;
      }
      if (mergeGutterEl && i < mergeGutterEl.children.length) {
        (mergeGutterEl.children[i] as HTMLElement).style.height = `${h}px`;
      }
    }
  };
  applyHeights();
  // ResizeObserver は jsdom 未実装のことがあるためガードする。
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(applyHeights);
    ro.observe(textContainer);
  }

  return {
    el: root,
    textarea,
    destroy() {
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("select", onSelect);
      if (onScroll) textarea.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      for (const h of childHandles) h.destroy();
    },
  };
}

/**
 * vanilla MergeEditorPanel を生成する。ソースモードでは diff/merge の textarea パネルを、WYSIWYG モードでは
 * editor をマウントする Paper を組み立てる。`update` で状態を反映して再描画し、`destroy` で全 listener /
 * ResizeObserver / Tooltip / IconButton / editor マウントを解放する。
 */
export function createMergeEditorPanel(
  opts: CreateMergeEditorPanelOptions,
): MergeEditorPanelHandle {
  ensureStyle(STYLE_ID, PANEL_CSS);

  const state: CreateMergeEditorPanelOptions = { ...opts };
  let segmentHandles: Array<{ destroy: () => void }> = [];
  let destroyed = false;

  // Paper ルート（.root + .outlined 相当・呼び元が配置）。
  const root = document.createElement("div");
  root.style.cssText =
    "background-color:var(--am-color-bg-paper);color:var(--am-color-text-primary);" +
    "border:1px solid var(--am-color-divider);";

  /** 子セグメント/ガターの listener を解放する。 */
  const releaseSegments = (): void => {
    for (const h of segmentHandles) h.destroy();
    segmentHandles = [];
  };

  /** WYSIWYG モードの editor マウント + tiptap CSS 注入。 */
  const renderWysiwyg = (): void => {
    const fontSize = state.editorSettings.fontSize;
    const hideScrollbar = state.hideScrollbar ?? false;
    root.style.flex = "1";
    root.style.overflow = "auto";
    root.style.borderRadius = "0";
    if (hideScrollbar) {
      root.style.scrollbarWidth = "none";
      (root.style as unknown as Record<string, string>).msOverflowStyle = "none";
    }
    // 左右ペインで showHoverLabels が異なるため side ごとにスコープを分ける（React 版と同一命名）。
    const scopeClass = `am-merge-content-${state.side ?? "default"}`;
    root.classList.add(scopeClass);

    // 比較固有 tiptap CSS（getMergeTiptapStyles の sx→CSS シリアライズ結果）を 1 度だけ注入する。
    if (state.tiptapCss) {
      ensureStyle(`${STYLE_ID}-tiptap-${scopeClass}`, state.tiptapCss);
    }

    // editor のマウント要素を root へ移設する（React EditorContent 相当）。
    const editor = state.editor;
    const mountEl = editor?.options.element as HTMLElement | undefined;
    if (mountEl && mountEl.parentElement !== root) {
      root.appendChild(mountEl);
    }
    // fontSize はスコープ CSS で当たるが、最低限のフォールバックも付与する。
    void fontSize;
  };

  /** ソースモードの diff/merge パネルを組み立てる。 */
  const renderSourceMode = (): void => {
    const rawText = state.sourceText ?? "";
    const autoResize = state.autoResize;
    const hideScrollbar = state.hideScrollbar ?? false;
    const fontSize = state.editorSettings.fontSize;
    const lineHeight = state.editorSettings.lineHeight;

    root.style.flex = "1";
    root.style.overflow = autoResize ? "auto" : "hidden";
    root.style.borderRadius = "0";
    if (hideScrollbar) {
      root.style.scrollbarWidth = "none";
      (root.style as unknown as Record<string, string>).msOverflowStyle = "none";
    }

    const effectiveLines = toEffectiveLines(state.diffLines, rawText);
    const totalRealLines = rawText === "" ? 1 : rawText.split("\n").length;
    const digits = String(totalRealLines).length;

    const inner = document.createElement("div");
    inner.style.minHeight = "100%";
    root.appendChild(inner);

    const mkSegment = (
      lines: DiffLine[],
      baseIdx: number,
      onSliceChange: ((value: string) => void) | undefined,
      segmentRawText = "",
    ): SourceSegmentHandle => {
      const seg = createSourceSegment({
        diffLines: lines,
        rawText: segmentRawText,
        baseAlignedIdx: baseIdx,
        side: state.side,
        readOnly: state.readOnly,
        autoResize,
        textareaAriaLabel: state.textareaAriaLabel,
        onSliceChange,
        onMerge: state.onMerge,
        onHoverLine: state.onHoverLine,
        fontSize,
        lineHeight,
        digits,
        hideScrollbar,
        t: state.t,
      });
      segmentHandles.push(seg);
      return seg;
    };

    // 折りたたみ OFF: 1 セグメントで全体描画（従来挙動）。全文を表すセグメントのため
    // rawText を渡し、diff 側で pop された "\n" 終端を表示テキストへ復元する。
    if (!state.collapse) {
      const seg = mkSegment(effectiveLines, 0, state.onSourceChange, rawText);
      inner.appendChild(seg.el);
      return;
    }

    // 折りたたみ ON: collapsed/visible 領域に分割して描画する。
    const regions = computeCollapsedRegions(effectiveLines, state.contextLines ?? 3, state.expandedStarts);
    const ranges = realLineRanges(effectiveLines, regions);

    const handleSliceChange = (range: { start: number; end: number }, sliceRealText: string): void => {
      const fullLines = rawText === "" ? [] : rawText.split("\n");
      const next = [
        ...fullLines.slice(0, range.start),
        ...sliceRealText.split("\n"),
        ...fullLines.slice(range.end),
      ];
      state.onSourceChange?.(next.join("\n"));
    };

    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri];
      if (region.kind === "collapsed") {
        const exp = createExpanderRow({
          count: region.collapsedCount,
          fontSize,
          lineHeight,
          onClick: () => state.onToggleExpand?.(region.startIdx),
          t: state.t,
        });
        segmentHandles.push(exp);
        inner.appendChild(exp.el);
        continue;
      }
      const range = ranges[ri];
      const seg = mkSegment(
        effectiveLines.slice(region.startIdx, region.endIdx),
        region.startIdx,
        (text) => handleSliceChange(range, text),
      );
      inner.appendChild(seg.el);
    }
  };

  /** state に基づき root の中身を再構築する。 */
  const render = (): void => {
    releaseSegments();
    root.replaceChildren();
    if (state.sourceMode) {
      renderSourceMode();
    } else {
      renderWysiwyg();
    }
  };

  render();

  return {
    el: root,
    update(next: Partial<CreateMergeEditorPanelOptions>) {
      if (destroyed) return;
      Object.assign(state, next);
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releaseSegments();
      root.replaceChildren();
    },
  };
}
