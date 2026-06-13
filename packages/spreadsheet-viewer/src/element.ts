/**
 * `<anytime-spreadsheet>` の登録エントリ（副作用あり）。
 *
 * このファイルを import すると Custom Element が登録される。`index.ts` には含めない
 * （クラスのみ export）ことで、CSV ユーティリティだけを使う既存 consumer
 * （markdown-viewer 等）に customElements.define の副作用を波及させない。
 *
 * esbuild 配布ビルド（`dist/anytime-spreadsheet.js` / `.iife.js`）のエントリでもある。
 */

import { AnytimeSpreadsheetElement } from "./AnytimeSpreadsheetElement";

export { AnytimeSpreadsheetElement };
export type { SpreadsheetChangeDetail } from "./AnytimeSpreadsheetElement";

if (typeof customElements !== "undefined" && !customElements.get("anytime-spreadsheet")) {
  customElements.define("anytime-spreadsheet", AnytimeSpreadsheetElement);
}
