/**
 * 脱React の vanilla DOM 検索/置換バー（旧 components/SearchReplaceBar.tsx の移植）。
 *
 * searchReplaceExtension の storage（`editor.storage.searchReplace`）と
 * `onSearchStateChange` コールバックで同期する。Mod-f（openSearch コマンド）で
 * `isOpen` が立ち、本バーが表示・フォーカスされる（旧 React 実装と同一フロー）。
 *
 * テーマ色は CSS 変数（--am-color-*）追従、i18n は opts.t。React 非依存。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import {
  SEARCH_COUNTER_FONT_SIZE,
  SEARCH_INPUT_FONT_SIZE,
} from "../constants/dimensions";
import { Z_TOOLBAR } from "../constants/zIndex";
import type { SearchReplaceStorage } from "../searchReplaceExtension";
import type { TranslationFn } from "../types";
import { svgIcon } from "@anytime-markdown/ui-core/dom";
import { createIconButton, type IconButtonHandle } from "@anytime-markdown/ui-core/IconButton";
import { createTooltip } from "@anytime-markdown/ui-core/Tooltip";

/** vendored Material Icons の SVG path（24x24 viewBox・ui/icons と同一）。 */
const PATH = {
  chevronRight: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  expandMore: "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z",
  clear:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  keyboardArrowUp: "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  keyboardArrowDown: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z",
  findReplace:
    "M11 6c1.38 0 2.63.56 3.54 1.46L12 10h6V4l-2.05 2.05C14.68 4.78 12.93 4 11 4c-3.53 0-6.43 2.61-6.92 6H6.1c.46-2.28 2.48-4 4.9-4m5.64 9.14c.66-.9 1.12-1.97 1.28-3.14H15.9c-.46 2.28-2.48 4-4.9 4-1.38 0-2.63-.56-3.54-1.46L10 12H4v6l2.05-2.05C7.32 17.22 9.07 18 11 18c1.55 0 2.98-.51 4.14-1.36L20 21.49 21.49 20z",
  doneAll:
    "m18 7-1.41-1.41-6.34 6.34 1.41 1.41zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12zM.41 13.41 6 19l1.41-1.41L1.83 12z",
} as const;

/** 検索入力のデバウンス（旧 React 実装と同値）。 */
const SEARCH_DEBOUNCE_MS = 200;

/** {@link createSearchReplaceBar} のオプション。 */
export interface CreateSearchReplaceBarOptions {
  editor: Editor;
  t: TranslationFn;
}

/** {@link createSearchReplaceBar} の戻り値。 */
export interface SearchReplaceBarHandle {
  /** バーの root（role="search"・初期 display:none）。 */
  el: HTMLElement;
  /** onSearchStateChange の解除・タイマー破棄・DOM 除去。 */
  destroy: () => void;
}

/** 検索/置換バーを生成する。表示制御は extension storage の状態変更通知で行う。 */
export function createSearchReplaceBar(
  opts: CreateSearchReplaceBarOptions,
): SearchReplaceBarHandle {
  const { editor, t } = opts;
  const storage = (editor.storage as { searchReplace?: SearchReplaceStorage }).searchReplace;
  if (!storage) {
    // SearchReplaceExtension 未搭載（最小構成 embed・テスト等）ではバーを無効化する。
    console.warn(
      `[${new Date().toISOString()}] [WARN] SearchReplaceBar: searchReplace storage not found; bar disabled`,
    );
    const inert = document.createElement("div");
    inert.style.display = "none";
    return { el: inert, destroy: () => inert.remove() };
  }

  let showReplace = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let focusTimer: ReturnType<typeof setTimeout> | null = null;
  const tooltips: Array<{ destroy: () => void }> = [];
  const iconButtons: IconButtonHandle[] = [];

  // --- root（Paper 相当・absolute 配置・初期非表示） ---
  const root = document.createElement("div");
  root.setAttribute("role", "search");
  root.style.cssText =
    "position:absolute;top:0;right:16px;border-radius:4px;" +
    "padding:4px 12px;display:none;flex-direction:column;gap:4px;" +
    "background-color:var(--am-color-bg-paper);box-shadow:var(--am-elevation-3);" +
    `z-index:${Z_TOOLBAR};`;

  /** tooltip 付き IconButton を生成し記録する。 */
  const mkBtn = (config: {
    ariaLabel: string;
    tipTitle: string;
    icon?: string;
    text?: string;
    onClick: () => void;
    pressed?: boolean;
  }): IconButtonHandle => {
    const children: Array<SVGSVGElement | string> = [];
    if (config.icon) children.push(svgIcon(config.icon, 16));
    if (config.text) children.push(config.text);
    const btn = createIconButton({
      size: "compact",
      ariaLabel: config.ariaLabel,
      children: children as never,
      onClick: config.onClick,
    });
    if (config.pressed !== undefined) {
      btn.el.setAttribute("aria-pressed", String(config.pressed));
    }
    tooltips.push(createTooltip({ reference: btn.el, title: config.tipTitle }));
    iconButtons.push(btn);
    return btn;
  };

  /** 検索/置換のテキスト input を生成する。 */
  const mkInput = (ariaLabel: string, placeholder: string): HTMLInputElement => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", ariaLabel);
    input.setAttribute("autocomplete", "off");
    input.placeholder = placeholder;
    input.style.cssText =
      `font-size:${SEARCH_INPUT_FONT_SIZE};padding:2px 6px;min-width:160px;` +
      "border:1px solid var(--am-color-divider);border-radius:3px;" +
      "background:transparent;color:inherit;outline-color:var(--am-color-primary-main);";
    return input;
  };

  // --- 検索行 ---
  const searchRow = document.createElement("div");
  searchRow.style.cssText = "display:flex;align-items:center;gap:4px;";

  const replaceToggleBtn = mkBtn({
    ariaLabel: t("replace"),
    tipTitle: t("replace"),
    icon: PATH.chevronRight,
    pressed: false,
    onClick: () => {
      showReplace = !showReplace;
      applyState();
    },
  });

  const searchInput = mkInput(t("searchPlaceholder"), t("searchPlaceholder"));

  const clearBtn = mkBtn({
    ariaLabel: t("clearSearch"),
    tipTitle: t("clearSearch"),
    icon: PATH.clear,
    onClick: () => {
      searchInput.value = "";
      editor.commands.setSearchTerm("");
      searchInput.focus();
    },
  });

  const counter = document.createElement("span");
  counter.setAttribute("aria-live", "polite");
  counter.setAttribute("aria-atomic", "true");
  counter.style.cssText =
    `white-space:nowrap;font-size:${SEARCH_COUNTER_FONT_SIZE};margin:0 2px;`;

  const caseBtn = mkBtn({
    ariaLabel: t("caseSensitive"),
    tipTitle: t("caseSensitive"),
    text: "Aa",
    pressed: false,
    onClick: () => editor.commands.toggleCaseSensitive(),
  });
  const wordBtn = mkBtn({
    ariaLabel: t("wholeWord"),
    tipTitle: t("wholeWord"),
    text: "Ab|",
    pressed: false,
    onClick: () => editor.commands.toggleWholeWord(),
  });
  const regexBtn = mkBtn({
    ariaLabel: t("regex"),
    tipTitle: t("regex"),
    text: ".*",
    pressed: false,
    onClick: () => editor.commands.toggleUseRegex(),
  });

  const prevBtn = mkBtn({
    ariaLabel: t("prevMatch"),
    tipTitle: `${t("prevMatch")} (Shift+Enter)`,
    icon: PATH.keyboardArrowUp,
    onClick: () => editor.commands.goToPrevMatch(),
  });
  const nextBtn = mkBtn({
    ariaLabel: t("nextMatch"),
    tipTitle: `${t("nextMatch")} (Enter)`,
    icon: PATH.keyboardArrowDown,
    onClick: () => editor.commands.goToNextMatch(),
  });

  /** バーを閉じて検索状態をクリアする（旧 handleClearAndBlur）。 */
  const closeBar = (): void => {
    searchInput.value = "";
    replaceInput.value = "";
    showReplace = false;
    root.style.display = "none";
    editor.commands.closeSearch();
    editor.commands.focus();
  };

  const closeBtn = mkBtn({
    ariaLabel: t("close"),
    tipTitle: t("close"),
    icon: PATH.close,
    onClick: closeBar,
  });

  searchRow.append(
    replaceToggleBtn.el,
    searchInput,
    clearBtn.el,
    counter,
    caseBtn.el,
    wordBtn.el,
    regexBtn.el,
    prevBtn.el,
    nextBtn.el,
    closeBtn.el,
  );

  // --- 置換行 ---
  const replaceRow = document.createElement("div");
  replaceRow.style.cssText =
    "display:none;align-items:center;gap:4px;padding-left:32px;";

  const replaceInput = mkInput(t("replacePlaceholder"), t("replacePlaceholder"));
  const replaceBtn = mkBtn({
    ariaLabel: t("replace"),
    tipTitle: t("replace"),
    icon: PATH.findReplace,
    onClick: () => editor.commands.replaceCurrentMatch(),
  });
  const replaceAllBtn = mkBtn({
    ariaLabel: t("replaceAll"),
    tipTitle: t("replaceAll"),
    icon: PATH.doneAll,
    onClick: () => editor.commands.replaceAllMatches(),
  });
  replaceRow.append(replaceInput, replaceBtn.el, replaceAllBtn.el);

  root.append(searchRow, replaceRow);

  // --- イベント ---
  const onSearchInput = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      editor.commands.setSearchTerm(searchInput.value);
    }, SEARCH_DEBOUNCE_MS);
  };
  searchInput.addEventListener("input", onSearchInput);

  const onSearchKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        editor.commands.goToPrevMatch();
      } else {
        editor.commands.goToNextMatch();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeBar();
    }
  };
  searchInput.addEventListener("keydown", onSearchKeyDown);

  const onReplaceInput = (): void => {
    editor.commands.setReplaceTerm(replaceInput.value);
  };
  replaceInput.addEventListener("input", onReplaceInput);

  const onReplaceKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") closeBar();
    }
  };
  replaceInput.addEventListener("keydown", onReplaceKeyDown);

  // --- storage 状態の反映 ---
  const toggleStyle = (btn: IconButtonHandle, active: boolean): void => {
    btn.el.setAttribute("aria-pressed", String(active));
    btn.el.style.backgroundColor = active ? "var(--am-color-primary-light)" : "transparent";
    btn.el.style.color = active ? "var(--am-color-primary-contrast)" : "inherit";
  };

  /** 検索結果カウンタ・トグル状態・置換行の表示を storage と同期する。 */
  const applyState = (): void => {
    const s = storage;
    // カウンタ（検索語ありのときのみ表示）。
    const hasTerm = !!searchInput.value || !!s.searchTerm;
    clearBtn.el.style.display = hasTerm ? "" : "none";
    counter.style.display = hasTerm ? "" : "none";
    if (hasTerm) {
      if (s.results.length > 0) {
        counter.textContent = t("searchResults", {
          current: String(s.currentIndex + 1),
          total: String(s.results.length),
        });
        counter.style.color = "var(--am-color-text-secondary)";
      } else {
        counter.textContent = t("noResults");
        counter.style.color = "var(--am-color-error-main)";
      }
    }
    toggleStyle(caseBtn, s.caseSensitive);
    toggleStyle(wordBtn, s.wholeWord && !s.useRegex);
    wordBtn.update?.({ disabled: s.useRegex });
    toggleStyle(regexBtn, s.useRegex);
    const hasResults = s.results.length > 0;
    prevBtn.update?.({ disabled: !hasResults });
    nextBtn.update?.({ disabled: !hasResults });
    replaceBtn.update?.({ disabled: !hasResults });
    replaceAllBtn.update?.({ disabled: !hasResults });
    // 置換行と折りたたみトグルアイコン。
    replaceRow.style.display = showReplace ? "flex" : "none";
    replaceToggleBtn.el.setAttribute("aria-pressed", String(showReplace));
    replaceToggleBtn.el.replaceChildren(
      svgIcon(showReplace ? PATH.expandMore : PATH.chevronRight, 16),
    );
  };

  /** extension からの状態変更通知（旧 React useEffect handler の移植）。 */
  const onStateChange = (): void => {
    const s = storage;
    if (s.isOpen && s.showReplace) showReplace = true;
    if (s.isOpen) {
      s.isOpen = false; // consume the flag（旧実装と同一）
      root.style.display = "flex";
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => searchInput.focus(), 50);
      // 選択テキストを初期検索語として使用。
      const { from, to } = editor.state.selection;
      if (from !== to) {
        const selectedText = editor.state.doc.textBetween(from, to);
        if (selectedText && selectedText.length < 200 && !selectedText.includes("\n")) {
          searchInput.value = selectedText;
          editor.commands.setSearchTerm(selectedText);
        }
      }
    } else if (!s.searchTerm && !s.replaceTerm) {
      // closeSearch で非表示。
      root.style.display = "none";
    }
    applyState();
  };
  storage.onSearchStateChange = onStateChange;

  applyState();

  return {
    el: root,
    destroy() {
      if (storage.onSearchStateChange === onStateChange) {
        storage.onSearchStateChange = undefined;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      if (focusTimer) clearTimeout(focusTimer);
      searchInput.removeEventListener("input", onSearchInput);
      searchInput.removeEventListener("keydown", onSearchKeyDown);
      replaceInput.removeEventListener("input", onReplaceInput);
      replaceInput.removeEventListener("keydown", onReplaceKeyDown);
      for (const tip of tooltips) tip.destroy();
      for (const btn of iconButtons) btn.destroy?.();
      root.remove();
    },
  };
}
