/**
 * `<anytime-markdown-rich-editor>` の登録エントリ（副作用あり）。
 *
 * import すると Custom Element が登録される。esbuild 配布ビルド
 * （`dist/anytime-markdown-rich-editor.js` / `.iife.js`）のエントリでもある。
 */

import { AnytimeMarkdownRichEditorElement } from "./AnytimeMarkdownRichEditorElement";

export { AnytimeMarkdownRichEditorElement };

if (typeof customElements !== "undefined" && !customElements.get("anytime-markdown-rich-editor")) {
  customElements.define("anytime-markdown-rich-editor", AnytimeMarkdownRichEditorElement);
}
