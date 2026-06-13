/**
 * `<anytime-graph>` の登録エントリ（副作用あり・React 非依存）。
 *
 * import すると Custom Element が登録される。`index.ts`（React を含む barrel）には載せず、
 * GraphView のみに依存するこのエントリを esbuild 配布ビルド
 * （`dist/anytime-graph.js` / `.iife.js`）の入口とすることで、配布バンドルを React フリーに保つ。
 */

import { AnytimeGraphElement } from "./AnytimeGraphElement";

export { AnytimeGraphElement };
export type { GraphNodeClickDetail } from "./AnytimeGraphElement";

if (typeof customElements !== "undefined" && !customElements.get("anytime-graph")) {
  customElements.define("anytime-graph", AnytimeGraphElement);
}
