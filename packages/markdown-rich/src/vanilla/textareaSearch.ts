/**
 * テキストエリア内検索・置換状態の vanilla 版 — useTextareaSearch の React 非依存移植。
 * findMatches ロジックは markdown-viewer から再実装（pure function）。
 */

export interface TextareaSearchMatch {
  start: number;
  end: number;
}

export interface TextareaSearchController {
  getSearchTerm: () => string;
  getReplaceTerm: () => string;
  getCaseSensitive: () => boolean;
  getMatches: () => readonly TextareaSearchMatch[];
  getCurrentIndex: () => number;
  setSearchTerm: (term: string) => void;
  setReplaceTerm: (term: string) => void;
  toggleCaseSensitive: () => void;
  goToNext: () => void;
  goToPrev: () => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
  focusSearch: () => void;
  reset: () => void;
  /** テキストとテキストエリア参照を更新 */
  updateText: (text: string) => void;
  updateTextareaRef: (ta: HTMLTextAreaElement | null) => void;
  updateSearchInputRef: (inp: HTMLInputElement | null) => void;
  /** テキスト変更コールバックを更新 */
  setOnTextChange: (fn: (newText: string) => void) => void;
  /** 状態変化購読 */
  subscribe: (fn: () => void) => () => void;
}

function findMatches(text: string, term: string, caseSensitive: boolean): TextareaSearchMatch[] {
  if (!term) return [];
  const results: TextareaSearchMatch[] = [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? term : term.toLowerCase();
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    results.push({ start: idx, end: idx + needle.length });
    pos = idx + 1;
  }
  return results;
}

export function createTextareaSearchState(
  initialText = "",
  initialOnTextChange: (newText: string) => void = () => {},
): TextareaSearchController {
  let text = initialText;
  let onTextChange = initialOnTextChange;
  let searchTerm = "";
  let replaceTerm = "";
  let caseSensitive = false;
  let matches: TextareaSearchMatch[] = [];
  let currentIndex = 0;
  let textareaRef: HTMLTextAreaElement | null = null;
  let searchInputRef: HTMLInputElement | null = null;
  const subscribers = new Set<() => void>();

  function notify(): void {
    for (const fn of subscribers) fn();
  }

  function recompute(): void {
    const newMatches = findMatches(text, searchTerm, caseSensitive);
    matches = newMatches;
    if (matches.length === 0) {
      currentIndex = 0;
    } else if (currentIndex >= matches.length) {
      currentIndex = 0;
    }
    notify();
  }

  function selectMatch(index: number): void {
    if (matches.length === 0) return;
    const match = matches[index];
    if (!match) return;
    const ta = textareaRef;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(match.start, match.end);
    const textBefore = text.substring(0, match.start);
    const linesBefore = textBefore.split("\n").length;
    const lineHeight = Number.parseFloat(getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight);
  }

  const ctrl: TextareaSearchController = {
    getSearchTerm: () => searchTerm,
    getReplaceTerm: () => replaceTerm,
    getCaseSensitive: () => caseSensitive,
    getMatches: () => matches,
    getCurrentIndex: () => currentIndex,
    setSearchTerm(term) { searchTerm = term; recompute(); },
    setReplaceTerm(term) { replaceTerm = term; notify(); },
    toggleCaseSensitive() { caseSensitive = !caseSensitive; recompute(); },
    goToNext() {
      if (matches.length === 0) return;
      currentIndex = (currentIndex + 1) % matches.length;
      notify();
      selectMatch(currentIndex);
    },
    goToPrev() {
      if (matches.length === 0) return;
      currentIndex = (currentIndex - 1 + matches.length) % matches.length;
      notify();
      selectMatch(currentIndex);
    },
    replaceCurrent() {
      if (matches.length === 0) return;
      const match = matches[currentIndex];
      if (!match) return;
      const newText = text.substring(0, match.start) + replaceTerm + text.substring(match.end);
      onTextChange(newText);
    },
    replaceAll() {
      if (matches.length === 0 || !searchTerm) return;
      let result = text;
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        result = result.substring(0, match.start) + replaceTerm + result.substring(match.end);
      }
      onTextChange(result);
      currentIndex = 0;
      notify();
    },
    focusSearch() { searchInputRef?.focus(); },
    reset() {
      searchTerm = "";
      replaceTerm = "";
      matches = [];
      currentIndex = 0;
      notify();
    },
    updateText(newText) {
      text = newText;
      recompute();
    },
    updateTextareaRef(ta) { textareaRef = ta; },
    updateSearchInputRef(inp) { searchInputRef = inp; },
    setOnTextChange(fn) { onTextChange = fn; },
    subscribe(fn) {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
  };

  return ctrl;
}
