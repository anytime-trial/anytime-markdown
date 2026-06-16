/**
 * 脱 React の vanilla DOM「InlineMergeView」ファクトリ
 * （framework-decoupling Phase 3 / D・追加のみ）。
 *
 * React 原版 `components/InlineMergeView.tsx`（462 行）+ 関連 5 hooks
 * （useMergeDiff / useMergeContentSync / useDiffHighlight / useScrollSync / useBlockAlignment /
 * useMergeFileOps）+ LinePreviewPanel を素 DOM ファクトリへ統合移植したもの。
 *
 * 構成: 左パネル = 比較対象（readOnly エディタ。本ファクトリが `new Editor` で生成・破棄管理）、
 * 右パネル = 本文エディタ（呼び元が渡す markdown-core Editor。生成・破棄は呼び元の責務）。
 * 表示上は左右が逆（画面左 = 比較 = leftEditor、画面右 = 本文 = rightEditor）であり、
 * React 版同様 direction を反転する。
 *
 * 変換規約（ui-vanilla / components-vanilla 共通）:
 * - React props/hooks → opts + closure 変数。戻り値は { el, update, destroy }。
 * - `useIsDark` 不要（`--am-color-*` CSS 変数でテーマ追従）。
 * - useState/useEffect/useRef → closure 変数 + editor.on / addEventListener + 明示 cleanup。
 * - diff/merge コア（useMergeDiff）の undo/redo/block ナビゲーションは closure ストアに再構成する。
 * - normalizeCompareMarkdown / collapsed 状態同期は utils/mergeContentSync.ts の純関数を流用する。
 * - 比較固有 tiptap CSS（getMergeTiptapStyles の sx→CSS シリアライズ結果）は opts.tiptapCss で受け、
 *   左右パネルの createMergeEditorPanel へ渡す（React 版 GlobalStyle 置換）。
 */

import { Editor } from "@anytime-markdown/markdown-core";
import type { AnyExtension } from "@anytime-markdown/markdown-core";
import {
  applyMerge,
  computeDiff,
  type DiffResult,
} from "@anytime-markdown/markdown-engine";

import { buildEditorExtensions } from "../buildEditorExtensions";
import { setMergeEditors } from "../contexts/MergeEditorsContext";
import { reviewModeStorage } from "../extensions/reviewModeExtension";
import { computeAlignSpacers } from "../hooks/useBlockAlignment";
import type { TranslationFn } from "../types";
import { createIconButton, createTooltip, svgIcon } from "../ui-vanilla";
import {
  computeBlockAlignment,
  computeBlockCollapsePlan,
  computeBlockDiff,
  type AlignedSlot,
} from "../utils/blockDiffComputation";
import { computeFollowerScrollTop, type BlockOffset } from "../utils/blockScrollMap";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { parseFrontmatter } from "../utils/frontmatterHelpers";
import {
  applyCollapsedStates,
  collectCollapsedStates,
  normalizeCompareMarkdown,
} from "../utils/mergeContentSync";
import {
  createFrontmatterCompareRow,
  type FrontmatterCompareRowHandle,
} from "./FrontmatterCompareRow";
import {
  createMergeEditorPanel,
  type MergeEditorPanelHandle,
} from "./MergeEditorPanel";
import {
  createLinePreviewPanel,
  type LinePreviewPanelHandle,
} from "./LinePreviewPanel";

/** 折りたたみ時に変更箇所の前後に残すコンテキスト量（React 版と同値）。 */
const MERGE_COLLAPSE_CONTEXT_LINES = 3;
const MERGE_COLLAPSE_CONTEXT_BLOCKS = 1;
const MERGE_INFO_FONT_SIZE = 11;

/** ui/icons.tsx と同一の Material SVG path。 */
const ICON_ARROW_UP = "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z";
const ICON_ARROW_DOWN = "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z";
const ICON_UNFOLD_LESS =
  "M7.41 18.59 8.83 20 12 16.83 15.17 20l1.41-1.41L12 14zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10z";

type MergeDirection = "left-to-right" | "right-to-left";

/** 親へ公開する undo/redo ハンドル（React `MergeUndoRedo` 相当）。 */
export interface MergeUndoRedo {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** 右パネルのファイル操作ハンドル（React `onRightFileOpsReady` の payload 相当）。 */
export interface MergeRightFileOps {
  loadFile: () => void;
  exportFile: () => void;
}

/** {@link createInlineMergeView} のオプション。 */
export interface CreateInlineMergeViewOptions {
  /** 右側本文エディタ（markdown-core Editor。生成・破棄は呼び元の責務）。 */
  editor: Editor | null;
  /** i18n。 */
  t: TranslationFn;
  /** エディタ設定（fontSize / lineHeight）。 */
  settings: { fontSize: number; lineHeight: number };
  /** ソースモード（textarea diff）か WYSIWYG（editor diff）か。 */
  sourceMode: boolean;
  /** 編集（右）側の現在コンテンツ。ソースモードは sourceText、WYSIWYG は editorMarkdown を渡す。 */
  editorContent: string;
  /**
   * 本ファイル（右）の frontmatter。WYSIWYG では body から切り離されるため、frontmatter は
   * body diff に含まれない。比較ファイル側は compareText から都度パースし、両者を比較行で並置する。
   * null/未指定は frontmatter 無し。ソースモードでは frontmatter はテキスト diff に含まれるため未使用。
   */
  frontmatter?: string | null;
  /**
   * 左パネルの mermaid/plantuml/math/html/embed 描画に必須の codeBlock 拡張
   * （rich の CodeBlockWithMermaid）。
   */
  codeBlockExtension?: AnyExtension;
  /**
   * 外部から渡す比較コンテンツ（VS Code 拡張のファイル読込）。consumed 後に onCompareContentConsumed。
   *
   * consume 契約: `null` は「新しい外部コンテンツなし」を意味する no-op（orchestrator は消費後
   * null を渡し続けるため、null でのクリアは行わない）。比較テキストを空にするには
   * 空文字 `""` を明示的に渡す。
   */
  compareContent?: string | null;
  /** compareContent を消費したことを親へ通知する（1 回限り反映用）。 */
  onCompareContentConsumed?: () => void;
  /** 編集（左データ＝画面右本文）テキストの変更通知。React `onLeftTextChange` 相当。 */
  onEditTextChange?: (text: string) => void;
  /** undo/redo ハンドルの変更通知（毎更新で最新を渡す）。null は無効化。 */
  onUndoRedoChange?: (handle: MergeUndoRedo | null) => void;
  /** 右パネルのファイル操作ハンドルの変更通知。null は無効化。 */
  onRightFileOpsChange?: (ops: MergeRightFileOps | null) => void;
  /** 比較固有 tiptap 実 CSS（左右両パネルへ渡す）。 */
  tiptapCss?: string;
}

/** {@link createInlineMergeView} の戻り値。 */
export interface InlineMergeViewHandle {
  /** root（呼び元が配置する）。 */
  el: HTMLElement;
  /** opts の一部を差し替えて再同期する。 */
  update: (next: Partial<CreateInlineMergeViewOptions>) => void;
  /** 全 listener / ResizeObserver / 左エディタ / パネルを解放する。 */
  destroy: () => void;
}

interface TextSnapshot {
  edit: string;
  compare: string;
}

/** Markdown ファイル内容をダウンロードする。 */
function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** export 用タイムスタンプ（React 版 useMergeFileOps と同形式）。 */
function exportTimestamp(): string {
  const n = new Date();
  const p2 = (v: number): string => String(v).padStart(2, "0");
  return (
    `${n.getFullYear()}${p2(n.getMonth() + 1)}${p2(n.getDate())}_` +
    `${p2(n.getHours())}${p2(n.getMinutes())}${p2(n.getSeconds())}`
  );
}

/** 最初のスクロール可能子要素を BFS で探す（useScrollSync findScrollableChild 同等）。 */
function findScrollableChild(container: HTMLElement): HTMLElement | null {
  const queue: HTMLElement[] = [container];
  while (queue.length > 0) {
    const el = queue.shift();
    if (!el) continue;
    if (el.scrollHeight > el.clientHeight + 1) {
      const style = getComputedStyle(el);
      if (style.overflowY === "auto" || style.overflowY === "scroll") return el;
    }
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) queue.push(child);
    }
  }
  return null;
}

/** scrollEl 基準で各トップレベルブロックの上端・高さを計測する（useScrollSync buildOffsetMap 同等）。 */
function buildOffsetMap(editor: Editor, scrollEl: HTMLElement): BlockOffset[] {
  const map: BlockOffset[] = [];
  const scrollRectTop = scrollEl.getBoundingClientRect().top;
  const scrollTop = scrollEl.scrollTop;
  let index = 0;
  editor.state.doc.forEach((_node, pos) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (dom && typeof dom.getBoundingClientRect === "function") {
      const top = dom.getBoundingClientRect().top - scrollRectTop + scrollTop;
      map.push({ index, top, height: dom.offsetHeight ?? 0 });
    } else {
      map.push({ index, top: 0, height: 0 });
    }
    index++;
  });
  return map;
}

function measureBlocks(editor: Editor): { heights: number[]; ends: number[] } {
  const heights: number[] = [];
  const ends: number[] = [];
  editor.state.doc.forEach((node, pos) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    heights.push(dom?.offsetHeight ?? 0);
    ends.push(pos + node.nodeSize);
  });
  return { heights, ends };
}

function serializeSpacers(spacers: { pos: number; height: number }[]): string {
  return spacers.map((s) => `${s.pos}:${s.height}`).join(",");
}

/**
 * diff/merge の状態（editText / compareText / undo-redo / block ナビ）を保持する closure ストア。
 * React `useMergeDiff` の純粋ロジックを再構成したもの（ProseMirror Plugin 状態には触れない）。
 */
function createMergeDiffStore(onChange: () => void) {
  let editText = "";
  let compareText = "";
  let currentBlockIndex = 0;
  let diffResult: DiffResult | null = null;
  const undoStack: TextSnapshot[] = [];
  const redoStack: TextSnapshot[] = [];
  let onEditTextChange: ((text: string) => void) | undefined;

  const recomputeDiff = (): void => {
    diffResult = editText === "" && compareText === "" ? null : computeDiff(editText, compareText, {});
    const total = diffResult?.blocks.length ?? 0;
    if (total === 0) currentBlockIndex = 0;
    else if (currentBlockIndex > total - 1) currentBlockIndex = total - 1;
  };
  recomputeDiff();

  const setEditText = (text: string): void => {
    if (editText === text) return;
    editText = text;
    recomputeDiff();
    onChange();
  };
  const setCompareText = (text: string): void => {
    if (compareText === text) return;
    compareText = text;
    recomputeDiff();
    onChange();
  };
  const pushUndo = (): void => {
    undoStack.push({ edit: editText, compare: compareText });
    redoStack.length = 0;
  };
  const applySnapshot = (snap: TextSnapshot): void => {
    const prevEdit = editText;
    editText = snap.edit;
    compareText = snap.compare;
    recomputeDiff();
    if (snap.edit !== prevEdit) onEditTextChange?.(snap.edit);
    onChange();
  };

  return {
    getEditText: (): string => editText,
    getCompareText: (): string => compareText,
    getDiffResult: (): DiffResult | null => diffResult,
    getCurrentBlockIndex: (): number => currentBlockIndex,
    getTotalBlocks: (): number => diffResult?.blocks.length ?? 0,
    getCanUndo: (): boolean => undoStack.length > 0,
    getCanRedo: (): boolean => redoStack.length > 0,
    setOnEditTextChange(cb: ((text: string) => void) | undefined): void {
      onEditTextChange = cb;
    },
    setEditText,
    setCompareText,
    goToNextBlock(): void {
      const total = diffResult?.blocks.length ?? 0;
      if (total === 0) return;
      currentBlockIndex = Math.min(currentBlockIndex + 1, total - 1);
      onChange();
    },
    goToPrevBlock(): void {
      currentBlockIndex = Math.max(currentBlockIndex - 1, 0);
      onChange();
    },
    mergeBlock(blockId: number, direction: MergeDirection): void {
      if (!diffResult) return;
      const block = diffResult.blocks.find((b) => b.id === blockId);
      if (!block) return;
      pushUndo();
      const prevEdit = editText;
      const { newLeftText, newRightText } = applyMerge(editText, compareText, block, direction);
      editText = newLeftText;
      compareText = newRightText;
      recomputeDiff();
      if (newLeftText !== prevEdit) onEditTextChange?.(newLeftText);
      onChange();
    },
    undo(): void {
      const snap = undoStack.pop();
      if (!snap) return;
      redoStack.push({ edit: editText, compare: compareText });
      applySnapshot(snap);
    },
    redo(): void {
      const snap = redoStack.pop();
      if (!snap) return;
      undoStack.push({ edit: editText, compare: compareText });
      applySnapshot(snap);
    },
  };
}

type MergeDiffStore = ReturnType<typeof createMergeDiffStore>;

/**
 * vanilla InlineMergeView を生成する。左パネル用 readOnly エディタを内部生成し、diff/merge の
 * 同期・ナビゲーション・スクロール同期・ハイライト・行プレビューを素 DOM + closure で再現する。
 */
export function createInlineMergeView(
  opts: CreateInlineMergeViewOptions,
): InlineMergeViewHandle {
  const state: CreateInlineMergeViewOptions = { ...opts };
  let destroyed = false;
  const disposers: Array<() => void> = [];

  // 構築完了までは scheduleSync を抑止する（store 初期化中の TDZ / 重複描画を避ける）。
  let ready = false;
  let syncRaf = 0;

  // --- 折りたたみ状態（React useState 置換） ---
  let collapseEnabled = false;
  let expandedStarts = new Set<number>();

  // --- diff/merge ストア ---
  const store = createMergeDiffStore(() => scheduleSync());
  store.setOnEditTextChange(state.onEditTextChange);
  store.setEditText(state.editorContent);

  // --- 左パネル用 readOnly エディタ（本ファクトリが所有） ---
  const leftMountEl = document.createElement("div");
  const leftEditor = new Editor({
    element: leftMountEl,
    extensions: buildEditorExtensions({
      mode: "compare",
      codeBlockExtension: state.codeBlockExtension,
    }),
    content: "",
    editorProps: {
      handleDOMEvents: {
        // ProseMirror の drop を素通しして親 div の drop へバブルさせる。
        drop: () => true,
      },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });
  // reviewMode 拡張未登録の構成（テスト用 StarterKit 等）では no-op（警告は初回のみ）。
  let reviewStorageWarned = false;
  const setLeftReviewEnabled = (enabled: boolean): void => {
    const storage = reviewModeStorage(leftEditor) as { enabled: boolean } | undefined;
    if (!storage) {
      if (!reviewStorageWarned) {
        reviewStorageWarned = true;
        console.warn("[InlineMergeView] reviewMode storage unavailable (extension not loaded)");
      }
      return;
    }
    storage.enabled = enabled;
  };
  setLeftReviewEnabled(true);

  // 左エディタのチェックボックスクリックをキャプチャフェーズでブロック。
  const leftDom = leftEditor.view.dom;
  const checkboxBlocker = (e: Event): void => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  for (const ev of ["click", "change", "mousedown"]) {
    leftDom.addEventListener(ev, checkboxBlocker, true);
  }
  disposers.push(() => {
    for (const ev of ["click", "change", "mousedown"]) {
      leftDom.removeEventListener(ev, checkboxBlocker, true);
    }
  });

  // NodeView ポータルへ左右エディタを登録する。
  setMergeEditors({ rightEditor: state.editor ?? null, leftEditor });
  disposers.push(() => setMergeEditors(null));

  // === DOM 構築 =============================================================
  const root = document.createElement("div");
  root.setAttribute("data-am-inline-merge", "");
  root.style.cssText =
    "display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;overflow:hidden;";

  // 隠しファイル input（右パネルのファイル読込）。
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".md,text/markdown,text/plain";
  fileInput.hidden = true;
  root.appendChild(fileInput);

  // --- frontmatter 比較行（WYSIWYG のみ。左=比較 / 右=本文） ---
  // 比較ファイルの frontmatter は compareText から都度パースする（body diff には含まれないため）。
  const compareFrontmatter = (): string | null =>
    parseFrontmatter(store.getCompareText()).frontmatter;
  const frontmatterRow: FrontmatterCompareRowHandle = createFrontmatterCompareRow({
    t: state.t,
    compareFrontmatter: compareFrontmatter(),
    mainFrontmatter: state.frontmatter ?? null,
  });
  root.appendChild(frontmatterRow.el);
  disposers.push(() => frontmatterRow.destroy());
  const syncFrontmatterRow = (): void => {
    // ソースモードでは frontmatter がテキスト diff に含まれるため比較行を隠す（hidden で内部一元管理）。
    frontmatterRow.update({
      hidden: state.sourceMode,
      compareFrontmatter: compareFrontmatter(),
      mainFrontmatter: state.frontmatter ?? null,
    });
  };

  // --- diff ナビゲーション + 折りたたみトグル ---
  const navBar = document.createElement("div");
  navBar.style.cssText =
    "display:flex;align-items:center;justify-content:flex-end;gap:4px;" +
    "padding-left:8px;padding-right:8px;padding-top:4px;padding-bottom:4px;flex-shrink:0;";

  const prevBtn = createIconButton({
    size: "small",
    ariaLabel: state.t("mergeNavPrev"),
    children: svgIcon(ICON_ARROW_UP, 18),
    onClick: () => store.goToPrevBlock(),
  });
  const prevTip = createTooltip({ reference: prevBtn.el, title: state.t("mergeNavPrev") });

  const counter = document.createElement("span");
  counter.setAttribute("aria-live", "polite");
  counter.style.cssText =
    "min-width:3.5em;text-align:center;font-variant-numeric:tabular-nums;" +
    `font-size:${MERGE_INFO_FONT_SIZE + 1}px;` +
    "color:color-mix(in srgb, var(--am-color-text-secondary) 80%, transparent);";

  const nextBtn = createIconButton({
    size: "small",
    ariaLabel: state.t("mergeNavNext"),
    children: svgIcon(ICON_ARROW_DOWN, 18),
    onClick: () => store.goToNextBlock(),
  });
  const nextTip = createTooltip({ reference: nextBtn.el, title: state.t("mergeNavNext") });

  const navDivider = document.createElement("div");
  navDivider.style.cssText =
    "width:1px;align-self:stretch;margin-left:4px;margin-right:4px;background-color:var(--am-color-divider);";

  const collapseBtn = createIconButton({
    size: "small",
    ariaLabel: state.t("collapseUnchanged"),
    children: svgIcon(ICON_UNFOLD_LESS, 18),
    onClick: () => {
      collapseEnabled = !collapseEnabled;
      expandedStarts = new Set(); // 切り替え時は手動展開をリセット。
      scheduleSync();
    },
  });
  const collapseTip = createTooltip({ reference: collapseBtn.el, title: state.t("collapseUnchanged") });

  navBar.append(prevBtn.el, counter, nextBtn.el, navDivider, collapseBtn.el);
  root.appendChild(navBar);
  disposers.push(() => {
    prevTip.destroy();
    nextTip.destroy();
    collapseTip.destroy();
    prevBtn.destroy();
    nextBtn.destroy();
    collapseBtn.destroy();
  });

  // --- コンテンツエリア（左 = 比較 / 右 = 本文） ---
  const contentArea = document.createElement("div");
  contentArea.style.cssText = "display:flex;flex:1;overflow:hidden;";

  // 左ペイン（ドロップターゲット）。
  const leftPaneWrap = document.createElement("div");
  leftPaneWrap.style.cssText = "flex:1;min-width:0;display:flex;overflow:hidden;position:relative;";
  const leftPaneInner = document.createElement("div");
  leftPaneInner.style.cssText =
    "flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;";
  leftPaneWrap.appendChild(leftPaneInner);

  const flippedMerge = (blockId: number, direction: MergeDirection): void => {
    // 画面上の左右とデータモデルの左右が逆なので direction を反転する。
    const flipped: MergeDirection = direction === "left-to-right" ? "right-to-left" : "left-to-right";
    store.mergeBlock(blockId, flipped);
  };

  const onHoverLine = (idx: number | null): void => {
    linePreview.setHoveredLine(idx);
  };

  // 左パネル（比較・readOnly）。
  const leftPanel: MergeEditorPanelHandle = createMergeEditorPanel({
    t: state.t,
    editorSettings: state.settings,
    sourceMode: state.sourceMode,
    sourceText: store.getCompareText(),
    onSourceChange: (v) => store.setCompareText(v),
    autoResize: true,
    editor: leftEditor,
    diffLines: store.getDiffResult()?.rightLines,
    side: "left",
    readOnly: true,
    hideScrollbar: true,
    onMerge: flippedMerge,
    onHoverLine,
    collapse: collapseEnabled,
    contextLines: MERGE_COLLAPSE_CONTEXT_LINES,
    expandedStarts,
    onToggleExpand: (s) => toggleExpand(s),
    tiptapCss: state.tiptapCss,
  });
  leftPaneInner.appendChild(leftPanel.el);

  // 中央 divider。
  const centerDivider = document.createElement("div");
  centerDivider.style.cssText = "width:1px;align-self:stretch;background-color:var(--am-color-divider);";

  // 右ペイン（本文）。
  const rightPaneWrap = document.createElement("div");
  rightPaneWrap.style.cssText = "flex:1;min-width:0;overflow:hidden;";
  const rightPanel: MergeEditorPanelHandle = createMergeEditorPanel({
    t: state.t,
    editorSettings: state.settings,
    sourceMode: state.sourceMode,
    sourceText: state.editorContent,
    onSourceChange: (v) => {
      store.setEditText(v);
      state.onEditTextChange?.(v);
    },
    textareaAriaLabel: state.t("sourceEditor"),
    editor: state.editor ?? null,
    autoResize: true,
    diffLines: store.getDiffResult()?.leftLines,
    side: "right",
    onHoverLine,
    collapse: collapseEnabled,
    contextLines: MERGE_COLLAPSE_CONTEXT_LINES,
    expandedStarts,
    onToggleExpand: (s) => toggleExpand(s),
    tiptapCss: state.tiptapCss,
  });
  rightPaneWrap.appendChild(rightPanel.el);

  contentArea.append(leftPaneWrap, centerDivider, rightPaneWrap);
  root.appendChild(contentArea);
  disposers.push(() => {
    leftPanel.destroy();
    rightPanel.destroy();
  });

  // --- 行プレビュー（ソースモードのみ） ---
  const linePreview: LinePreviewPanelHandle = createLinePreviewPanel({
    diffResult: store.getDiffResult(),
    sourceMode: state.sourceMode,
    editorSettings: state.settings,
  });
  root.appendChild(linePreview.el);
  disposers.push(() => linePreview.destroy());

  // === 折りたたみトグル ===
  function toggleExpand(startIdx: number): void {
    const next = new Set(expandedStarts);
    if (next.has(startIdx)) next.delete(startIdx);
    else next.add(startIdx);
    expandedStarts = next;
    scheduleSync();
  }

  // === ファイル操作（useMergeFileOps 相当） ================================
  const loadFile = (file: File): void => {
    file
      .text()
      .then((text) => {
        if (destroyed) return;
        store.setCompareText(text);
      })
      .catch((e: unknown) => {
        console.error("[InlineMergeView] ファイル読込に失敗:", file.name, e);
      });
  };
  const onFileInputChange = (): void => {
    const f = fileInput.files?.[0];
    if (f) loadFile(f);
    fileInput.value = "";
  };
  fileInput.addEventListener("change", onFileInputChange);
  disposers.push(() => fileInput.removeEventListener("change", onFileInputChange));

  // ドラッグ&ドロップ（左ペイン）。
  const setDragOver = (active: boolean): void => {
    leftPaneWrap.style.outline = active ? "2px dashed var(--am-color-primary-main)" : "";
    leftPaneWrap.style.outlineOffset = active ? "-2px" : "";
  };
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!leftPaneWrap.contains(e.relatedTarget as Node)) setDragOver(false);
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith(".md") || file.name.endsWith(".markdown") || file.type.startsWith("text/"))) {
      loadFile(file);
    }
  };
  leftPaneWrap.addEventListener("dragover", onDragOver);
  leftPaneWrap.addEventListener("dragenter", onDragOver);
  leftPaneWrap.addEventListener("dragleave", onDragLeave);
  leftPaneWrap.addEventListener("drop", onDrop);
  disposers.push(() => {
    leftPaneWrap.removeEventListener("dragover", onDragOver);
    leftPaneWrap.removeEventListener("dragenter", onDragOver);
    leftPaneWrap.removeEventListener("dragleave", onDragLeave);
    leftPaneWrap.removeEventListener("drop", onDrop);
  });

  // Ctrl+S で右パネル内容も保存通知。
  const onKeyDownSave = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      globalThis.dispatchEvent(
        new CustomEvent("vscode-save-compare-file", { detail: store.getCompareText() }),
      );
    }
  };
  document.addEventListener("keydown", onKeyDownSave);
  disposers.push(() => document.removeEventListener("keydown", onKeyDownSave));

  // F8 で次/前ブロックへ。
  const onMergeNavKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "F8") return;
    e.preventDefault();
    if (e.shiftKey) store.goToPrevBlock();
    else store.goToNextBlock();
  };
  root.addEventListener("keydown", onMergeNavKeyDown);
  disposers.push(() => root.removeEventListener("keydown", onMergeNavKeyDown));

  // === diff ハイライト（useDiffHighlight 相当） ============================
  let highlightRaf = 0;
  const runDiffHighlight = (): void => {
    const rightEditor = state.editor;
    if (state.sourceMode) {
      requestAnimationFrame(() => {
        if (rightEditor && !rightEditor.isDestroyed) rightEditor.commands.clearDiffHighlight();
        if (!leftEditor.isDestroyed) leftEditor.commands.clearDiffHighlight();
      });
      return;
    }
    if (!rightEditor || rightEditor.isDestroyed || leftEditor.isDestroyed) return;
    const label = state.t("expandBlocks");
    const { left, right } = computeBlockDiff(rightEditor.state.doc, leftEditor.state.doc, { semantic: true });
    const plan = collapseEnabled
      ? computeBlockCollapsePlan(rightEditor.state.doc, leftEditor.state.doc, MERGE_COLLAPSE_CONTEXT_BLOCKS)
      : null;
    cancelAnimationFrame(highlightRaf);
    highlightRaf = requestAnimationFrame(() => {
      highlightRaf = 0;
      if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      rightEditor.commands.setDiffHighlight(left, "left");
      leftEditor.commands.setDiffHighlight(right, "right");
      rightEditor.commands.setCollapsePlan(plan ? plan.aRuns : [], label);
      leftEditor.commands.setCollapsePlan(plan ? plan.bRuns : [], label);
    });
  };

  // === ブロックアライン（useBlockAlignment 相当） ==========================
  let alignRaf = 0;
  let aligning = false;
  let prevSpacerA = "";
  let prevSpacerB = "";
  const runBlockAlignment = (): void => {
    const rightEditor = state.editor;
    const disabled = state.sourceMode || !rightEditor;
    if (disabled) {
      requestAnimationFrame(() => {
        if (rightEditor && !rightEditor.isDestroyed) rightEditor.commands.setAlignSpacers([]);
        if (!leftEditor.isDestroyed) leftEditor.commands.setAlignSpacers([]);
      });
      return;
    }
    cancelAnimationFrame(alignRaf);
    alignRaf = requestAnimationFrame(() => {
      if (aligning || rightEditor.isDestroyed || leftEditor.isDestroyed) return;
      const slots = computeBlockAlignment(rightEditor.state.doc, leftEditor.state.doc);
      const { aSpacers, bSpacers } = computeAlignSpacers(
        slots,
        measureBlocks(rightEditor),
        measureBlocks(leftEditor),
      );
      const sigA = serializeSpacers(aSpacers);
      const sigB = serializeSpacers(bSpacers);
      if (sigA === prevSpacerA && sigB === prevSpacerB) return;
      prevSpacerA = sigA;
      prevSpacerB = sigB;
      aligning = true;
      rightEditor.commands.setAlignSpacers(aSpacers);
      leftEditor.commands.setAlignSpacers(bSpacers);
      aligning = false;
    });
  };

  // === スクロール同期（useScrollSync 相当） ===============================
  let programmatic: { el: HTMLElement; top: number } | null = null;
  let slots: AlignedSlot[] = [];
  let aMap: BlockOffset[] = [];
  let bMap: BlockOffset[] = [];
  let scrollStale = true;
  // スクローラ探索（findScrollableChild の BFS）は scroll イベントごとに走ると O(DOM) の
  // 無駄が大きいためキャッシュする。パネル再構築で detach されたら（isConnected=false）
  // 再探索し、markScrollStale でも明示的に無効化する。fallback はキャッシュしない
  // （スクローラ未生成の初期状態に固定されるのを防ぐ）。
  let rightScrollerCache: HTMLElement | null = null;
  let leftScrollerCache: HTMLElement | null = null;
  const getRightScroller = (): HTMLElement => {
    if (!rightScrollerCache?.isConnected) rightScrollerCache = findScrollableChild(rightPaneWrap);
    return rightScrollerCache ?? rightPaneWrap;
  };
  const getLeftScroller = (): HTMLElement => {
    if (!leftScrollerCache?.isConnected) leftScrollerCache = findScrollableChild(leftPaneInner);
    return leftScrollerCache ?? leftPaneInner;
  };
  const rebuildScroll = (): void => {
    const rightEditor = state.editor;
    if (state.sourceMode || !rightEditor || rightEditor.isDestroyed || leftEditor.isDestroyed) return;
    slots = computeBlockAlignment(rightEditor.state.doc, leftEditor.state.doc);
    aMap = buildOffsetMap(rightEditor, getRightScroller());
    bMap = buildOffsetMap(leftEditor, getLeftScroller());
    scrollStale = false;
  };
  const isEcho = (el: HTMLElement): boolean =>
    !!programmatic && programmatic.el === el && Math.abs(el.scrollTop - programmatic.top) <= 1;
  const setFollower = (el: HTMLElement, top: number): void => {
    programmatic = { el, top };
    el.scrollTop = top;
  };
  const ratioSync = (from: HTMLElement, to: HTMLElement): void => {
    const max = from.scrollHeight - from.clientHeight;
    const ratio = max > 0 ? from.scrollTop / max : 0;
    setFollower(to, ratio * (to.scrollHeight - to.clientHeight));
  };
  const syncScroll = (leaderSide: "a" | "b"): void => {
    const rightEditor = state.editor;
    const blockMode = !state.sourceMode && !!rightEditor && !!leftEditor;
    const leaderEl = leaderSide === "a" ? getRightScroller() : getLeftScroller();
    const followerEl = leaderSide === "a" ? getLeftScroller() : getRightScroller();
    if (isEcho(leaderEl)) {
      programmatic = null;
      return;
    }
    if (!blockMode) {
      ratioSync(leaderEl, followerEl);
      return;
    }
    if (scrollStale) rebuildScroll();
    const top = computeFollowerScrollTop({
      leaderScrollTop: leaderEl.scrollTop,
      leaderMap: leaderSide === "a" ? aMap : bMap,
      followerMap: leaderSide === "a" ? bMap : aMap,
      slots,
      leaderSide,
      followerMaxScroll: followerEl.scrollHeight - followerEl.clientHeight,
    });
    setFollower(followerEl, top);
  };
  const onRightScroll = (e: Event): void => {
    if (e.target !== getRightScroller()) return;
    syncScroll("a");
  };
  const onLeftScroll = (): void => syncScroll("b");
  rightPaneWrap.addEventListener("scroll", onRightScroll, true);
  leftPaneInner.addEventListener("scroll", onLeftScroll, true);
  disposers.push(() => {
    rightPaneWrap.removeEventListener("scroll", onRightScroll, true);
    leftPaneInner.removeEventListener("scroll", onLeftScroll, true);
  });
  const markScrollStale = (): void => {
    scrollStale = true;
    rightScrollerCache = null;
    leftScrollerCache = null;
  };

  // === エディタ update 購読（diff ハイライト・アライン・スクロール再計測・collapsed 同期） ===
  let collapsedSyncRaf = 0;
  const syncCollapsedToLeft = (): void => {
    const rightEditor = state.editor;
    if (!rightEditor || state.sourceMode) return;
    if (rightEditor.isDestroyed || leftEditor.isDestroyed) return;
    const sourceStates = collectCollapsedStates(rightEditor.state.doc);
    cancelAnimationFrame(collapsedSyncRaf);
    collapsedSyncRaf = requestAnimationFrame(() => {
      if (leftEditor.isDestroyed) return;
      const tr = leftEditor.state.tr;
      const changed = applyCollapsedStates(leftEditor.state.doc, tr, sourceStates);
      if (changed) {
        setLeftReviewEnabled(false);
        leftEditor.view.dispatch(tr);
        setLeftReviewEnabled(true);
      }
    });
  };

  const onLeftUpdate = (): void => {
    runDiffHighlight();
    runBlockAlignment();
    markScrollStale();
  };
  const onRightUpdate = (): void => {
    runDiffHighlight();
    runBlockAlignment();
    markScrollStale();
    syncCollapsedToLeft();
  };
  leftEditor.on("update", onLeftUpdate);
  disposers.push(() => leftEditor.off("update", onLeftUpdate));

  // ResizeObserver（アライン・スクロール再計測）。jsdom 未実装をガード。
  let ro: ResizeObserver | undefined;
  const attachRightEditorListeners = (rightEditor: Editor | null): void => {
    if (!rightEditor) return;
    rightEditor.on("update", onRightUpdate);
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        runBlockAlignment();
        markScrollStale();
      });
      ro.observe(leftEditor.view.dom);
      if (!rightEditor.isDestroyed) ro.observe(rightEditor.view.dom);
    }
  };
  const detachRightEditorListeners = (rightEditor: Editor | null): void => {
    if (rightEditor && !rightEditor.isDestroyed) rightEditor.off("update", onRightUpdate);
    ro?.disconnect();
    ro = undefined;
  };
  attachRightEditorListeners(state.editor ?? null);
  disposers.push(() => detachRightEditorListeners(state.editor ?? null));

  // === 左エディタへの compareText 反映（useMergeContentSync 相当） ===========
  let leftPopulateRaf = 0;
  let leftNormalizeRaf = 0;
  const populateLeftEditor = (): void => {
    cancelAnimationFrame(leftPopulateRaf);
    leftPopulateRaf = requestAnimationFrame(() => {
      if (leftEditor.isDestroyed) return;
      try {
        setLeftReviewEnabled(false);
        applyMarkdownToEditor(leftEditor, store.getCompareText());
      } catch (e: unknown) {
        console.error("[InlineMergeView] 左エディタへの compareText 反映に失敗:", e);
      } finally {
        if (!leftEditor.isDestroyed) setLeftReviewEnabled(true);
      }
    });
  };
  const normalizeCompareSource = (): void => {
    const compareText = store.getCompareText();
    if (!state.sourceMode || compareText === "") return;
    cancelAnimationFrame(leftNormalizeRaf);
    leftNormalizeRaf = requestAnimationFrame(() => {
      if (leftEditor.isDestroyed) return;
      let normalized: string | null = null;
      try {
        setLeftReviewEnabled(false);
        normalized = normalizeCompareMarkdown(leftEditor, compareText);
      } catch (e: unknown) {
        console.error("[InlineMergeView] compareText の正規化に失敗:", e);
      } finally {
        if (!leftEditor.isDestroyed) setLeftReviewEnabled(true);
      }
      if (normalized !== null && normalized !== compareText) store.setCompareText(normalized);
    });
  };

  // === 描画反映（store onChange / opts update） ============================
  let prevSourceMode = state.sourceMode;
  const renderNav = (): void => {
    const total = store.getTotalBlocks();
    const idx = store.getCurrentBlockIndex();
    counter.textContent = total === 0 ? "0 / 0" : `${idx + 1} / ${total}`;
    prevBtn.el.toggleAttribute("disabled", total === 0);
    nextBtn.el.toggleAttribute("disabled", total === 0);
    collapseBtn.el.setAttribute("aria-pressed", String(collapseEnabled));
    // 非アクティブを "" にすると IconButton の color:inherit が消え <button> が UA 黒に戻る。
    collapseBtn.el.style.color = collapseEnabled ? "var(--am-color-primary-main)" : "inherit";
  };

  const notifyUndoRedo = (): void => {
    state.onUndoRedoChange?.({
      undo: () => store.undo(),
      redo: () => store.redo(),
      canUndo: store.getCanUndo(),
      canRedo: store.getCanRedo(),
    });
  };

  const sync = (): void => {
    if (destroyed) return;
    const diffResult = store.getDiffResult();
    renderNav();
    leftPanel.update({
      sourceMode: state.sourceMode,
      sourceText: store.getCompareText(),
      diffLines: diffResult?.rightLines,
      collapse: collapseEnabled,
      expandedStarts,
      editor: leftEditor,
      editorSettings: state.settings,
      tiptapCss: state.tiptapCss,
    });
    rightPanel.update({
      sourceMode: state.sourceMode,
      sourceText: state.editorContent,
      diffLines: diffResult?.leftLines,
      collapse: collapseEnabled,
      expandedStarts,
      editor: state.editor ?? null,
      editorSettings: state.settings,
      tiptapCss: state.tiptapCss,
    });
    linePreview.update({
      diffResult,
      sourceMode: state.sourceMode,
      editorSettings: state.settings,
    });
    notifyUndoRedo();
    normalizeCompareSource();
    if (!state.sourceMode) populateLeftEditor();
    syncFrontmatterRow();
    runDiffHighlight();
    runBlockAlignment();
  };

  function scheduleSync(): void {
    if (destroyed || !ready) return;
    cancelAnimationFrame(syncRaf);
    syncRaf = requestAnimationFrame(sync);
  }

  // 初回反映（次フレームを待たず即時に行い、テストや初期描画で値が入るようにする）。
  ready = true;
  sync();

  // 右パネルのファイル操作ハンドルを公開。
  state.onRightFileOpsChange?.({
    loadFile: () => fileInput.click(),
    exportFile: () => downloadText(store.getCompareText(), `document_right_${exportTimestamp()}.md`),
  });

  // 外部比較コンテンツの初回反映。
  const consumeCompareContent = (): void => {
    if (state.compareContent != null) {
      store.setCompareText(state.compareContent);
      state.onCompareContentConsumed?.();
    }
  };
  consumeCompareContent();

  return {
    el: root,
    update(next: Partial<CreateInlineMergeViewOptions>) {
      if (destroyed) return;
      const editorChanged = "editor" in next && next.editor !== state.editor;
      const prevEditor = state.editor ?? null;
      const sourceModeChanged = "sourceMode" in next && next.sourceMode !== state.sourceMode;
      Object.assign(state, next);
      if ("onEditTextChange" in next) store.setOnEditTextChange(state.onEditTextChange);
      if (editorChanged) {
        detachRightEditorListeners(prevEditor);
        setMergeEditors({ rightEditor: state.editor ?? null, leftEditor });
        attachRightEditorListeners(state.editor ?? null);
        scrollStale = true;
      }
      if ("editorContent" in next) store.setEditText(state.editorContent);
      if ("compareContent" in next) consumeCompareContent();
      // source -> WYSIWYG 切替時は右(=画面右本文)を保ったまま左エディタを再 populate する。
      if (sourceModeChanged && prevSourceMode && !state.sourceMode) populateLeftEditor();
      prevSourceMode = state.sourceMode;
      scheduleSync();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(syncRaf);
      cancelAnimationFrame(highlightRaf);
      cancelAnimationFrame(alignRaf);
      cancelAnimationFrame(collapsedSyncRaf);
      cancelAnimationFrame(leftPopulateRaf);
      cancelAnimationFrame(leftNormalizeRaf);
      for (const dispose of disposers) {
        try {
          dispose();
        } catch (e: unknown) {
          console.error("[InlineMergeView] dispose に失敗:", e);
        }
      }
      if (!leftEditor.isDestroyed) leftEditor.destroy();
      root.replaceChildren();
    },
  };
}
