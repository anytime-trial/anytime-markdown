/**
 * `<anytime-markdown-editor>` の登録エントリ（副作用あり）。
 *
 * import すると Custom Element が登録される。`index.ts` には載せない（クラスのみ export）ことで、
 * mount API やユーティリティだけを使う既存 consumer に customElements.define の副作用を波及させない。
 *
 * esbuild 配布ビルド（`dist/anytime-markdown-editor.js` / `.iife.js`）のエントリでもある。
 */

import { AnytimeMarkdownEditorElement } from "./AnytimeMarkdownEditorElement";

export { AnytimeMarkdownEditorElement };
export type { MarkdownChangeDetail } from "./AnytimeMarkdownEditorElement";

if (typeof customElements !== "undefined" && !customElements.get("anytime-markdown-editor")) {
  customElements.define("anytime-markdown-editor", AnytimeMarkdownEditorElement);
}
