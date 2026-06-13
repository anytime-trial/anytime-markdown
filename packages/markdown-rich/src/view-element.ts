/**
 * `<anytime-markdown-view>`（read-only 最小表示）の登録エントリ（副作用あり）。
 * import すると Custom Element が登録される。
 */

import { AnytimeMarkdownViewElement } from "./AnytimeMarkdownViewElement";

export { AnytimeMarkdownViewElement };

if (typeof customElements !== "undefined" && !customElements.get("anytime-markdown-view")) {
  customElements.define("anytime-markdown-view", AnytimeMarkdownViewElement);
}
