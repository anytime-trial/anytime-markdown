/**
 * `<anytime-chart>` の登録エントリ（副作用あり・React 非依存）。
 *
 * import すると Custom Element が登録される。`index.ts`（barrel）には載せず、ChartView のみに
 * 依存するこのエントリを esbuild 配布ビルド（`dist/anytime-chart.js` / `.iife.js`）の入口にする
 * ことで、配布バンドルを React フリーに保つ。
 */

import { AnytimeChartElement } from "./AnytimeChartElement";

export { AnytimeChartElement };

if (typeof customElements !== "undefined" && !customElements.get("anytime-chart")) {
  customElements.define("anytime-chart", AnytimeChartElement);
}
