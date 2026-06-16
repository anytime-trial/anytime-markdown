/**
 * 拡張ページ（editor.html）のエントリ。
 *
 * `@anytime-markdown/markdown-rich/element` を import すると
 * `<anytime-markdown-rich-editor>` Custom Element が登録される（副作用 import）。
 * mermaid / katex / plantuml / math / graph に対応する rich 版。
 *
 * 軽量なプレーン版に戻す場合は `@anytime-markdown/markdown-viewer/element`
 * （`<anytime-markdown-editor>`）に差し替える。
 *
 * 要素は `options` を connect 前に渡すため JS で生成する（属性で表現できない
 * sideToolbar / hide 等を一度の mount で反映するため）。
 */
import "@anytime-markdown/markdown-rich/element";

/**
 * 本拡張で WC に渡す最小オプション型（このファイルは esbuild トランスパイルのみで
 * 型検査を受けないため、必要な口だけを局所定義する）。
 */
interface RichEditorElement extends HTMLElement {
  options: {
    sideToolbar?: boolean;
    hide?: { explorer?: boolean };
  };
  value: string;
}

/** 使用する chrome.storage.local の口だけを構造的に表す（@types/chrome 非依存）。 */
interface StorageArea {
  get(key: string, callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>): void;
}

const STORAGE_KEY = "anytime-markdown:last-document";

/** chrome.storage.local（拡張コンテキスト外では undefined）。 */
function getStorage(): StorageArea | undefined {
  return (globalThis as { chrome?: { storage?: { local?: StorageArea } } }).chrome
    ?.storage?.local;
}

/**
 * rich エディタ要素を生成して #editor-root にマウントする。
 * 編集内容は chrome.storage.local に自動保存し、再起動後に復元する。
 */
function createEditor(initialContent: string): void {
  const root = document.getElementById("editor-root");
  if (!root) return;

  const el = document.createElement("anytime-markdown-rich-editor") as RichEditorElement;
  el.setAttribute("theme", "light");
  el.setAttribute("locale", "ja");
  // web-app と同様に右端の縦サイドツールバー（アウトライン / コメント / 設定）を表示する。
  // explorer（ファイルエクスプローラ）は GitHub / fileSystemProvider 未配線のため隠す
  // （web-app の `hide={{ explorer: !enableGitHub }}` 相当）。
  el.options = { sideToolbar: true, hide: { explorer: true } };
  if (initialContent) el.value = initialContent;

  el.addEventListener("change", (event) => {
    const detail = (event as CustomEvent<{ value: string }>).detail;
    if (detail?.value === undefined) return;
    getStorage()?.set({ [STORAGE_KEY]: detail.value });
  });

  // options / value を connect 前に確定させてから append（単一 mount）。
  root.appendChild(el);
}

function init(): void {
  const storage = getStorage();
  if (!storage) {
    createEditor("");
    return;
  }
  storage.get(STORAGE_KEY, (items) => {
    const saved = items?.[STORAGE_KEY];
    createEditor(typeof saved === "string" ? saved : "");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
