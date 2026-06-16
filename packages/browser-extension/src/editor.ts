/**
 * 拡張ページ（editor.html）のエントリ。
 *
 * `@anytime-markdown/markdown-viewer/element` を import するだけで
 * `<anytime-markdown-editor>` Custom Element が登録される（副作用 import）。
 *
 * mermaid / katex / plantuml も使いたい場合は markdown-rich の
 * `AnytimeMarkdownRichEditorElement`（`<anytime-markdown-rich-editor>`）に差し替える。
 */
import "@anytime-markdown/markdown-viewer/element";

/**
 * 編集内容を chrome.storage.local に自動保存し、再起動後に復元する最小サンプル。
 * 不要なら削除してよい。File System Access API（showOpenFilePicker / showSaveFilePicker）は
 * 拡張ページが secure context のため追加パーミッションなしで利用できる。
 */
const STORAGE_KEY = "anytime-markdown:last-document";

function setupAutosave(): void {
  const el = document.querySelector("anytime-markdown-editor");
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
