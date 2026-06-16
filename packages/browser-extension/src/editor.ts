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
 * 重量モジュール（mermaid / plotly / jsxgraph 等）は動的 import で遅延ロードされ、
 * esbuild の code splitting でチャンク分割される。katex の CSS / フォントは
 * dist/editor.css（+ フォントファイル）として出力され editor.html が link する。
 */
import "@anytime-markdown/markdown-rich/element";

/**
 * 編集内容を chrome.storage.local に自動保存し、再起動後に復元する最小サンプル。
 * 不要なら削除してよい。File System Access API（showOpenFilePicker / showSaveFilePicker）は
 * 拡張ページが secure context のため追加パーミッションなしで利用できる。
 */
const STORAGE_KEY = "anytime-markdown:last-document";

function setupAutosave(): void {
  const el = document.querySelector("anytime-markdown-rich-editor");
  if (!el) return;

  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return;

  storage.get(STORAGE_KEY, (items) => {
    const saved = items?.[STORAGE_KEY];
    if (typeof saved === "string" && saved.length > 0) {
      (el as unknown as { value: string }).value = saved;
    }
  });

  el.addEventListener("change", (event) => {
    const detail = (event as CustomEvent<{ value: string }>).detail;
    if (detail?.value === undefined) return;
    storage.set({ [STORAGE_KEY]: detail.value });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupAutosave, { once: true });
} else {
  setupAutosave();
}
