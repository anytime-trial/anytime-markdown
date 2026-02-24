import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface SearchReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  results: { from: number; to: number }[];
  currentIndex: number;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  isOpen: boolean;
  showReplace: boolean;
  onSearchStateChange?: () => void;
}

const searchReplacePluginKey = new PluginKey("searchReplace");

/** Detect ReDoS-prone patterns: nested quantifiers like (a+)+, (a*)+, (a+)*, overlapping alternation */
const REDOS_RE = /(\((?:[^()]*[+*])[^()]*\))[+*{]|\(\?[^)]*[+*][^)]*\)[+*{]/;

function getRegex(storage: SearchReplaceStorage): RegExp | null {
  const { searchTerm, caseSensitive, wholeWord, useRegex } = storage;
  if (!searchTerm) return null;

  try {
    const flags = caseSensitive ? "g" : "gi";
    let pattern: string;
    if (useRegex) {
      if (REDOS_RE.test(searchTerm)) return null;
      pattern = searchTerm;
    } else {
      pattern = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    if (wholeWord && !useRegex) {
      pattern = `\\b${pattern}\\b`;
    }
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function findMatches(
  doc: PMNode,
  regex: RegExp,
): { from: number; to: number }[] {
  const results: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) break;
      results.push({ from: pos + match.index, to: pos + match.index + match[0].length });
    }
  });
  return results;
}


export const SearchReplaceExtension = Extension.create<Record<string, never>, SearchReplaceStorage>({
  name: "searchReplace",

  addStorage() {
    return {
      searchTerm: "",
      replaceTerm: "",
      results: [],
      currentIndex: 0,
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      isOpen: false,
      showReplace: false,
      onSearchStateChange: undefined,
    };
  },

  addCommands() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
      setSearchTerm:
        (term: string) =>
        () => {
          this.storage.searchTerm = term;
          this.storage.currentIndex = 0;
          updateSearchResults(this.editor);
          return true;
        },
      setReplaceTerm:
        (term: string) =>
        () => {
          this.storage.replaceTerm = term;
          return true;
        },
      toggleCaseSensitive:
        () =>
        () => {
          this.storage.caseSensitive = !this.storage.caseSensitive;
          this.storage.currentIndex = 0;
          updateSearchResults(this.editor);
          return true;
        },
      toggleWholeWord:
        () =>
        () => {
          this.storage.wholeWord = !this.storage.wholeWord;
          this.storage.currentIndex = 0;
          updateSearchResults(this.editor);
          return true;
        },
      toggleUseRegex:
        () =>
        () => {
          this.storage.useRegex = !this.storage.useRegex;
          this.storage.currentIndex = 0;
          updateSearchResults(this.editor);
          return true;
        },
      goToNextMatch:
        () =>
        () => {
          const s = this.storage;
          if (s.results.length === 0) return false;
          s.currentIndex = (s.currentIndex + 1) % s.results.length;
          scrollToMatch(this.editor);
          updateDecorations(this.editor);
          return true;
        },
      goToPrevMatch:
        () =>
        () => {
          const s = this.storage;
          if (s.results.length === 0) return false;
          s.currentIndex =
            (s.currentIndex - 1 + s.results.length) % s.results.length;
          scrollToMatch(this.editor);
          updateDecorations(this.editor);
          return true;
        },
      replaceCurrentMatch:
        () =>
        () => {
          const s = this.storage;
          if (s.results.length === 0) return false;
          const match = s.results[s.currentIndex];
          if (!match) return false;

          const { state } = this.editor;
          const tr = state.tr.insertText(s.replaceTerm, match.from, match.to);
          this.editor.view.dispatch(tr);
          updateSearchResults(this.editor);
          return true;
        },
      replaceAllMatches:
        () =>
        () => {
          const s = this.storage;
          if (s.results.length === 0) return false;

          const { state } = this.editor;
          let tr = state.tr;
          // 後ろから置換して位置のずれを回避
          for (let i = s.results.length - 1; i >= 0; i--) {
            const match = s.results[i];
            tr = tr.insertText(s.replaceTerm, match.from, match.to);
          }
          this.editor.view.dispatch(tr);
          s.results = [];
          s.currentIndex = 0;
          updateDecorations(this.editor);
          return true;
        },
      openSearch:
        () =>
        () => {
          this.storage.isOpen = true;
          this.storage.showReplace = false;
          this.storage.onSearchStateChange?.();
          return true;
        },
      openSearchReplace:
        () =>
        () => {
          this.storage.isOpen = true;
          this.storage.showReplace = true;
          this.storage.onSearchStateChange?.();
          return true;
        },
      closeSearch:
        () =>
        () => {
          const s = this.storage;
          s.isOpen = false;
          s.searchTerm = "";
          s.replaceTerm = "";
          s.results = [];
          s.currentIndex = 0;
          s.onSearchStateChange?.();
          updateDecorations(this.editor);
          return true;
        },
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  },

  addKeyboardShortcuts() {
    return {
      "Mod-f": () => {
        this.editor.commands.openSearch();
        return true;
      },
      "Mod-h": () => {
        this.editor.commands.openSearchReplace();
        return true;
      },
      Escape: () => {
        const s = this.storage as SearchReplaceStorage;
        if (s.searchTerm || s.replaceTerm) {
          this.editor.commands.closeSearch();
          return true;
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchReplacePluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldDecorations) {
            const meta = tr.getMeta(searchReplacePluginKey);
            if (meta) return meta;
            if (tr.docChanged) {
              return oldDecorations.map(tr.mapping, tr.doc);
            }
            return oldDecorations;
          },
        },
        props: {
          decorations(state) {
            return searchReplacePluginKey.getState(state);
          },
        },
        view: () => {
          return {
            update: (view, prevState) => {
              const storage = this.storage as SearchReplaceStorage;
              if (!storage.isOpen || !storage.searchTerm) return;
              if (view.state.doc.eq(prevState.doc)) return;
              const regex = getRegex(storage);
              if (!regex) return;
              const newResults = findMatches(view.state.doc, regex);
              const oldLen = storage.results.length;
              storage.results = newResults;
              if (newResults.length !== oldLen) {
                if (storage.currentIndex >= newResults.length) {
                  storage.currentIndex = 0;
                }
                storage.onSearchStateChange?.();
              }
            },
          };
        },
      }),
    ];
  },
});

function updateSearchResults(editor: Editor) {
  const storage = editor.storage.searchReplace;
  const regex = getRegex(storage);
  if (!regex) {
    storage.results = [];
    storage.currentIndex = 0;
    updateDecorations(editor);
    return;
  }
  storage.results = findMatches(editor.state.doc, regex);
  if (storage.currentIndex >= storage.results.length) {
    storage.currentIndex = 0;
  }
  scrollToMatch(editor);
  updateDecorations(editor);
}

function updateDecorations(editor: Editor) {
  const storage = editor.storage.searchReplace;
  const decorations: Decoration[] = [];

  storage.results.forEach((match, i) => {
    const className =
      i === storage.currentIndex ? "search-match-current" : "search-match";
    decorations.push(
      Decoration.inline(match.from, match.to, { class: className }),
    );
  });

  const decoSet = DecorationSet.create(editor.state.doc, decorations);
  const tr = editor.state.tr.setMeta(searchReplacePluginKey, decoSet);
  editor.view.dispatch(tr);
  storage.onSearchStateChange?.();
}

function scrollToMatch(editor: Editor) {
  const storage = editor.storage.searchReplace;
  if (storage.results.length === 0) return;
  const match = storage.results[storage.currentIndex];
  if (!match) return;

  try {
    const domAtPos = editor.view.domAtPos(match.from);
    const node =
      domAtPos.node instanceof HTMLElement
        ? domAtPos.node
        : domAtPos.node.parentElement;
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    // ignore scroll errors
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      toggleCaseSensitive: () => ReturnType;
      toggleWholeWord: () => ReturnType;
      toggleUseRegex: () => ReturnType;
      goToNextMatch: () => ReturnType;
      goToPrevMatch: () => ReturnType;
      replaceCurrentMatch: () => ReturnType;
      replaceAllMatches: () => ReturnType;
      openSearch: () => ReturnType;
      openSearchReplace: () => ReturnType;
      closeSearch: () => ReturnType;
    };
  }
  interface Storage {
    searchReplace: SearchReplaceStorage;
  }
}
