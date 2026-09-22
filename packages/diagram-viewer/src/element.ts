/**
 * `<anytime-diagram-viewer>` の登録エントリ（副作用あり）。
 *
 * import すると Custom Element が登録される。`index.ts` には登録を載せない（クラスと型だけを
 * export する）ことで、mount API だけを使う既存の宿主（web-app の `/diagram` ページ・
 * Anytime Diagram 拡張の webview・markdown-rich-editor の系図ダイアログとプレビュー）へ
 * `customElements.define` の副作用を波及させない。cooccurrence-viewer と markdown-editor が
 * 採っているのと同じ分離。
 *
 * esbuild 配布ビルド（`dist/anytime-diagram-viewer.js` / `.iife.js`）のエントリでもある。
 */

import { AnytimeDiagramViewerElement } from './AnytimeDiagramViewerElement';

export { AnytimeDiagramViewerElement };
export type {
  DiagramDocumentDetail,
  DiagramDraftDetail,
  DiagramElementAnnexDetail,
  DiagramElementSelectDetail,
} from './AnytimeDiagramViewerElement';

if (typeof customElements !== 'undefined' && !customElements.get('anytime-diagram-viewer')) {
  customElements.define('anytime-diagram-viewer', AnytimeDiagramViewerElement);
}
