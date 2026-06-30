/**
 * `<anytime-markdown-view>`（lean read-only 表示）の登録エントリ（副作用あり）。
 * import すると Custom Element が登録される。lean 公開ラッパのバンドルエントリでもある。
 */
import { AnytimeMarkdownViewElement } from "./AnytimeMarkdownViewElement";

export { AnytimeMarkdownViewElement };

if (typeof customElements !== "undefined" && !customElements.get("anytime-markdown-view")) {
  customElements.define("anytime-markdown-view", AnytimeMarkdownViewElement);
}
