/**
 * 脱React の vanilla DOM ステータスバー「StatusBar」（framework-decoupling Phase 3）。
 *
 * React 原版 `components/StatusBar.tsx`（MUI Button / Menu / MenuItem / Tooltip / Text 消費）の
 * 素 DOM 版。エディタ下端固定（position:fixed）のステータスバーで、カーソル行/列・文字数・行数を
 * 表示し、ファイル名 + dirty ドット・行末（LF/CRLF）切替メニュー・エンコード切替メニューを提供する。
 *
 * 変換規約:
 * - React props → opts（editor / t / コールバック / flag）。戻り値は { el, update, destroy }。
 * - useIsDark は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従するため isDark 分岐は削除）。
 *   React 原版が getTextSecondary(isDark) / getDivider(isDark) / getBgPaper(isDark) /
 *   getWarningMain(isDark) で当てていた色は `--am-color-text-secondary` /
 *   `--am-color-divider` / `--am-color-bg-paper` / `--am-color-warning-main` に置換する。
 * - useState/useEffect/useRef → closure 変数 + 明示的 listener 登録/解除。
 * - useConfirm（React hook）→ opts.confirm?: (message)=>Promise<boolean> に置換。confirm が無い場合は
 *   確認なしで即適用する（既存 React 版は confirm 必須だったが、vanilla 版は host 注入を任意にする）。
 * - editor のカーソルは `editor.on("selectionUpdate")` / `editor.on("update")` を購読し destroy で解除。
 * - React の <Menu open anchorEl> パターン → 開く時に createMenu({ anchorEl, onClose, children }) を生成
 *   （self-append で document.body へマウント）、閉じる時にそのハンドルを destroy。MenuItem は
 *   ui-vanilla の createMenuItem で構成する。
 *
 * 本 PoC は **追加のみ・本番未配線**（React 原版 components/StatusBar.tsx は変更しない）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { STATUSBAR_FONT_SIZE } from "../constants/dimensions";
import type { EncodingLabel, TranslationFn } from "../types";
import {
  createButton,
  createMenu,
  createMenuItem,
  createText,
  createTooltip,
} from "../ui-vanilla";

/** ステータスバーが算出する派生値（React 原版 StatusInfo と同一）。 */
export interface StatusInfo {
  line: number;
  col: number;
  charCount: number;
  lineCount: number;
  lineEnding: string;
  encoding: string;
}

/** 行末の選択肢。 */
const LINE_ENDINGS = ["LF", "CRLF"] as const;
type LineEnding = (typeof LINE_ENDINGS)[number];

/** エンコードの選択肢。 */
const ENCODINGS: readonly EncodingLabel[] = ["UTF-8", "Shift_JIS", "EUC-JP"];

/** {@link createStatusBar} のオプション（React `StatusBarProps` の vanilla 再現）。 */
export interface CreateStatusBarOptions {
  /** TipTap エディタ。カーソル位置 / 文字数 / 行数を購読する。 */
  editor: Editor;
  /** ソースモード（textarea 編集）か。true ならカーソルは textarea から算出する。 */
  sourceMode?: boolean;
  /** ソースモード時の生テキスト（文字数 / 行数 / 行末判定に使う）。 */
  sourceText?: string;
  /**
   * ソースモードの textarea への参照（カーソル行/列の算出元）。
   * 未指定時は `textarea[data-am-source-textarea]` を document から検索する
   * （merge ビュー等の aria-label 付き無関係 textarea への誤マッチ防止）。
   */
  getSourceTextarea?: () => HTMLTextAreaElement | null;
  /** i18n。 */
  t: TranslationFn;
  /** 表示ファイル名（null/undefined なら非表示）。 */
  fileName?: string | null;
  /** 未保存変更あり（dirty ドット表示）。 */
  isDirty?: boolean;
  /** 行末切替コールバック（未指定なら行末はテキスト表示のみ）。 */
  onLineEndingChange?: (ending: LineEnding) => void;
  /** 現在のエンコード（既定 "UTF-8"）。 */
  encoding?: EncodingLabel;
  /** エンコード切替コールバック（未指定ならエンコードはテキスト表示のみ）。 */
  onEncodingChange?: (encoding: EncodingLabel) => void;
  /** 派生 status が変わるたびに通知する（React onStatusChange 相当）。 */
  onStatusChange?: (status: StatusInfo) => void;
  /**
   * 確認ダイアログ（React useConfirm の置換）。エンコード変更前に呼ばれ、
   * resolve(true) で変更を適用、resolve(false) / reject で中止する。未指定なら確認なしで即適用。
   */
  confirm?: (message: string) => Promise<boolean>;
  /** 非表示（true なら el は空のプレースホルダ div）。 */
  hidden?: boolean;
}

/** {@link createStatusBar} の戻り値。 */
export interface StatusBarHandle {
  /** root（position:fixed のステータスバー div、hidden 時は空 div）。 */
  el: HTMLElement;
  /** 状態（sourceMode / sourceText / fileName / encoding 等）を反映して再描画する。 */
  update: (next: Partial<CreateStatusBarOptions>) => void;
  /** editor 購読 / document listener / 開いている menu / tooltip を解放する。 */
  destroy: () => void;
}

/** 共通のセカンダリテキスト style（React 原版 getTextSecondary(isDark) 相当）。 */
const SECONDARY_STYLE = "color:var(--am-color-text-secondary);";

/**
 * vanilla ステータスバーを生成する。
 *
 * 構成（左→右）: カーソル行/列・文字数・行数（aria-live polite）/ ファイル名 + dirty ドット /
 * spacer / 行末切替（メニュー or テキスト） / エンコード切替（メニュー or テキスト）。
 *
 * カーソル位置は WYSIWYG では `editor.on("selectionUpdate"/"update")`、ソースモードでは document の
 * click/keyup/select から textarea を読む。行末/エンコードメニューは開く時に createMenu を生成し
 * （document.body へ self-append）、選択 / 背景クリック / ESC で destroy する。
 */
export function createStatusBar(opts: CreateStatusBarOptions): StatusBarHandle {
  const { editor } = opts;
  const t = opts.t;

  // --- 可変状態（React useState 相当の closure 変数） ---
  let sourceMode = opts.sourceMode ?? false;
  let sourceText = opts.sourceText ?? "";
  let fileName = opts.fileName ?? null;
  let isDirty = opts.isDirty ?? false;
  let encoding: EncodingLabel = opts.encoding ?? "UTF-8";
  let onLineEndingChange = opts.onLineEndingChange;
  let onEncodingChange = opts.onEncodingChange;
  let onStatusChange = opts.onStatusChange;
  let confirm = opts.confirm;
  let hidden = opts.hidden ?? false;

  // WYSIWYG カーソル（editor から）。
  let cursorLine = 1;
  let cursorCol = 1;
  // ソースモードカーソル（textarea から）。
  let sourceCursorLine = 1;
  let sourceCursorCol = 1;

  // 開いているメニューのハンドル（同時に 1 つ）。
  let openMenu: { destroy: () => void } | null = null;
  // dirty ドットの tooltip ハンドル。
  let dirtyTooltip: { destroy: () => void } | null = null;

  // --- root ---
  const el = document.createElement("div");

  // --- 行末判定（React useMemo 相当。sourceText に \r\n が含まれれば CRLF） ---
  const computeLineEnding = (): LineEnding =>
    sourceText.includes("\r\n") ? "CRLF" : "LF";

  // --- 派生値の算出（React の displayLine / charCount 等と同一ロジック） ---
  const displayLine = (): number => (sourceMode ? sourceCursorLine : cursorLine);
  const displayCol = (): number => (sourceMode ? sourceCursorCol : cursorCol);
  const charCount = (): number =>
    sourceMode ? sourceText.length : editor.state.doc.textContent.length;
  const lineCount = (): number =>
    sourceMode ? sourceText.split("\n").length : editor.state.doc.content.childCount;

  // 直近に通知した status（重複通知を避けるための比較用シリアライズ）。
  let lastStatusKey = "";
  const notifyStatus = (): void => {
    const status: StatusInfo = {
      line: displayLine(),
      col: displayCol(),
      charCount: charCount(),
      lineCount: lineCount(),
      lineEnding: computeLineEnding(),
      encoding,
    };
    const key = `${status.line}|${status.col}|${status.charCount}|${status.lineCount}|${status.lineEnding}|${status.encoding}`;
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    onStatusChange?.(status);
  };

  // --- 子要素ハンドル（render で参照・update で差し替え） ---
  const cursorText = createText({ variant: "body2", style: SECONDARY_STYLE });
  const charText = createText({ variant: "body2", style: SECONDARY_STYLE });
  const lineText = createText({ variant: "body2", style: SECONDARY_STYLE });

  // ファイル名表示（fileName ありのときだけ root に挿入される）。
  const fileNameText = createText({
    variant: "body2",
    component: "span",
    style: `margin-left:8px;${SECONDARY_STYLE}`,
  });

  // 行末トリガ（button or text）。
  const lineEndingButton = createButton({ size: "small" });
  // Button.ts は style を opts で受けないため、cssText を直接補う（fontSize / 色）。
  lineEndingButton.el.style.color = "var(--am-color-text-secondary)";
  lineEndingButton.el.style.fontSize = STATUSBAR_FONT_SIZE;
  const lineEndingText = createText({ variant: "body2", style: SECONDARY_STYLE });

  // エンコードトリガ（button or text）。
  const encodingButton = createButton({ size: "small" });
  encodingButton.el.style.color = "var(--am-color-text-secondary)";
  encodingButton.el.style.fontSize = STATUSBAR_FONT_SIZE;
  const encodingText = createText({ variant: "body2", style: SECONDARY_STYLE });

  // 行末メニューを開く（React <Menu anchorEl=lineEndingAnchor>）。
  lineEndingButton.update({
    onClick: () => openLineEndingMenu(lineEndingButton.el),
  });
  encodingButton.update({
    onClick: () => openEncodingMenu(encodingButton.el),
  });

  /** 行末メニューを開く。選択 / 閉じで destroy。 */
  function openLineEndingMenu(anchorEl: HTMLElement): void {
    if (!onLineEndingChange) return;
    closeMenu();
    const current = computeLineEnding();
    const items = LINE_ENDINGS.map((optValue) => {
      const item = createMenuItem({
        children: optValue,
        selected: optValue === current,
        onClick: () => {
          onLineEndingChange?.(optValue);
          closeMenu();
        },
      });
      return item.el;
    });
    openMenu = createMenu({
      anchorEl,
      onClose: closeMenu,
      children: items,
      ariaLabel: t("lineEnding"),
    });
  }

  /** エンコードメニューを開く。選択時は confirm を介して onEncodingChange を呼ぶ。 */
  function openEncodingMenu(anchorEl: HTMLElement): void {
    if (!onEncodingChange) return;
    closeMenu();
    const current = encoding;
    const items = ENCODINGS.map((optValue) => {
      const item = createMenuItem({
        children: optValue,
        selected: optValue === current,
        onClick: () => {
          closeMenu();
          if (optValue === current) return;
          const message = t("encodingChangeConfirm", { encoding: optValue });
          // confirm 未指定なら確認なしで即適用（React 原版は confirm 必須だったが任意化）。
          if (!confirm) {
            onEncodingChange?.(optValue);
            return;
          }
          confirm(message)
            .then((ok) => {
              if (ok) onEncodingChange?.(optValue);
            })
            .catch((err: unknown) => {
              // confirm が reject した場合（キャンセル相当）。silent catch を避け context を残す。
              console.warn(
                `[StatusBar] encoding change confirm rejected (encoding=${optValue}):`,
                err,
              );
            });
        },
      });
      return item.el;
    });
    openMenu = createMenu({
      anchorEl,
      onClose: closeMenu,
      children: items,
      ariaLabel: t("encoding"),
    });
  }

  /** 開いているメニューを閉じる（あれば destroy）。 */
  function closeMenu(): void {
    openMenu?.destroy();
    openMenu = null;
  }

  /** dirty ドット（FiberManualRecord 相当の小円 SVG）を生成する。color は warning-main。 */
  // SVG（dot）を span でラップして返す（createTooltip の reference は HTMLElement を要求するため）。
  function buildDirtyDot(): HTMLSpanElement {
    const wrap = document.createElement("span");
    wrap.style.cssText = "display:inline-flex;align-items:center;margin-left:4px;";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "8");
    svg.setAttribute("height", "8");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "color:var(--am-color-warning-main);";
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "8");
    svg.appendChild(circle);
    wrap.appendChild(svg);
    return wrap;
  }

  // --- root の構築 / 再構築（hidden / fileName / メニュー有無で配置が変わる） ---
  function render(): void {
    // 既存 dirty tooltip を破棄して作り直す（fileName 再構築のたびに掃除する）。
    dirtyTooltip?.destroy();
    dirtyTooltip = null;
    // root をクリア（子ハンドルの el は使い回すので destroy しない）。
    for (const node of [...el.childNodes]) el.removeChild(node);

    if (hidden) {
      // React 原版は null を返すが、vanilla はハンドルの el を維持するため空 div にする。
      el.removeAttribute("id");
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
      el.style.cssText = "display:none;";
      return;
    }

    el.id = "md-editor-statusbar";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", t("statusBar"));
    el.setAttribute("contenteditable", "false");
    el.style.cssText =
      "display:flex;align-items:center;gap:16px;" +
      "padding-left:12px;padding-right:12px;" +
      "height:33px;min-height:33px;max-height:33px;" +
      "border-top:1px solid var(--am-color-divider);" +
      "overflow:hidden;flex-shrink:0;" +
      "position:fixed;bottom:0;left:0;right:0;" +
      "background-color:var(--am-color-bg-paper);z-index:1;";

    // aria-live 群（カーソル / 文字数 / 行数）。
    const liveWrap = document.createElement("div");
    liveWrap.setAttribute("aria-live", "polite");
    liveWrap.setAttribute("aria-atomic", "true");
    liveWrap.style.cssText = "display:contents;";
    liveWrap.appendChild(cursorText.el);
    liveWrap.appendChild(charText.el);
    liveWrap.appendChild(lineText.el);
    el.appendChild(liveWrap);

    // ファイル名 + dirty ドット。
    if (fileName) {
      fileNameText.el.textContent = "";
      fileNameText.el.appendChild(document.createTextNode(fileName));
      fileNameText.el.setAttribute(
        "aria-label",
        isDirty ? `${fileName} (${t("unsavedChanges")})` : fileName,
      );
      if (isDirty) {
        const dot = buildDirtyDot();
        fileNameText.el.appendChild(dot);
        dirtyTooltip = createTooltip({ reference: dot, title: t("unsavedChanges") });
      }
      el.appendChild(fileNameText.el);
    }

    // spacer（右寄せ）。
    const spacer = document.createElement("div");
    spacer.style.cssText = "flex:1;";
    el.appendChild(spacer);

    // 行末 + エンコードの右寄せ群。
    const rightGroup = document.createElement("div");
    rightGroup.style.cssText = "display:flex;gap:16px;align-items:center;";
    rightGroup.appendChild(onLineEndingChange ? lineEndingButton.el : lineEndingText.el);
    rightGroup.appendChild(onEncodingChange ? encodingButton.el : encodingText.el);
    el.appendChild(rightGroup);

    refreshTexts();
  }

  /** テキスト内容（行/列・文字数・行数・行末・エンコード）を最新値で更新する。 */
  function refreshTexts(): void {
    cursorText.update({
      children: `${t("cursorLine")} ${displayLine()} ${t("cursorCol")} ${displayCol()}`,
    });
    charText.update({
      children: `${charCount().toLocaleString()} ${t("chars")}`,
    });
    lineText.update({
      children: `${lineCount().toLocaleString()} ${t("lines")}`,
    });
    const ending = computeLineEnding();
    lineEndingButton.update({ label: ending });
    lineEndingText.update({ children: ending });
    encodingButton.update({ label: encoding });
    encodingText.update({ children: encoding });
  }

  // --- editor カーソル購読（React useEffect 相当） ---
  const updateEditorCursor = (): void => {
    const { $from } = editor.state.selection;
    cursorLine = $from.index(0) + 1;
    cursorCol = $from.parentOffset + 1;
    if (!sourceMode) {
      refreshTexts();
      notifyStatus();
    }
  };
  editor.on("selectionUpdate", updateEditorCursor);
  editor.on("update", updateEditorCursor);

  // --- ソースモード textarea カーソル監視（React useEffect + handleSourceCursor 相当） ---
  const SOURCE_EVENTS = ["click", "keyup", "select"] as const;
  let sourceListenersBound = false;
  const handleSourceCursor = (): void => {
    const textarea =
      opts.getSourceTextarea?.() ??
      document.querySelector<HTMLTextAreaElement>("textarea[data-am-source-textarea]");
    if (!textarea) return;
    const pos = textarea.selectionStart ?? 0;
    const before = textarea.value.substring(0, pos);
    const line = (before.match(/\n/g) || []).length + 1;
    const col = pos - textarea.value.lastIndexOf("\n", pos - 1);
    sourceCursorLine = line;
    sourceCursorCol = col;
    refreshTexts();
    notifyStatus();
  };
  const bindSourceListeners = (): void => {
    if (sourceListenersBound) return;
    sourceListenersBound = true;
    for (const e of SOURCE_EVENTS) document.addEventListener(e, handleSourceCursor);
    handleSourceCursor();
  };
  const unbindSourceListeners = (): void => {
    if (!sourceListenersBound) return;
    sourceListenersBound = false;
    for (const e of SOURCE_EVENTS) document.removeEventListener(e, handleSourceCursor);
  };

  // 初期化（render → 初期カーソル → 初期 status 通知）。
  render();
  updateEditorCursor();
  if (sourceMode) bindSourceListeners();
  notifyStatus();

  return {
    el,
    update(next: Partial<CreateStatusBarOptions>) {
      let needsRender = false;
      if (next.sourceMode !== undefined && next.sourceMode !== sourceMode) {
        sourceMode = next.sourceMode;
        if (sourceMode) bindSourceListeners();
        else unbindSourceListeners();
      }
      if (next.sourceText !== undefined) sourceText = next.sourceText;
      if (next.encoding !== undefined) encoding = next.encoding;
      if (next.confirm !== undefined) confirm = next.confirm;
      if (next.onStatusChange !== undefined) onStatusChange = next.onStatusChange;
      if (next.fileName !== undefined) {
        fileName = next.fileName;
        needsRender = true;
      }
      if (next.isDirty !== undefined) {
        isDirty = next.isDirty;
        needsRender = true;
      }
      if (next.onLineEndingChange !== undefined) {
        onLineEndingChange = next.onLineEndingChange;
        needsRender = true;
      }
      if (next.onEncodingChange !== undefined) {
        onEncodingChange = next.onEncodingChange;
        needsRender = true;
      }
      if (next.hidden !== undefined && next.hidden !== hidden) {
        hidden = next.hidden;
        needsRender = true;
      }

      // メニューが開いている間に行末/エンコードハンドラが消えたら閉じる。
      if (!onLineEndingChange && !onEncodingChange) closeMenu();

      if (needsRender) render();
      else refreshTexts();
      notifyStatus();
    },
    destroy() {
      editor.off("selectionUpdate", updateEditorCursor);
      editor.off("update", updateEditorCursor);
      unbindSourceListeners();
      closeMenu();
      dirtyTooltip?.destroy();
      dirtyTooltip = null;
      cursorText.destroy();
      charText.destroy();
      lineText.destroy();
      fileNameText.destroy();
      lineEndingButton.destroy();
      lineEndingText.destroy();
      encodingButton.destroy();
      encodingText.destroy();
    },
  };
}
