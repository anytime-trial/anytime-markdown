/**
 * `<anytime-cooccurrence-viewer>` の登録エントリ（副作用あり）。
 *
 * import すると Custom Element が登録される。`index.ts` には登録を載せない（クラスのみ export）
 * ことで、mount API だけを使う既存 consumer（web-app / graph 拡張）に customElements.define の
 * 副作用を波及させない（markdown-viewer の `element.ts` と同じ分離）。
 *
 * esbuild 配布ビルド（`dist/anytime-cooccurrence-viewer.js` / `.iife.js`）のエントリでもある。
 */

import { AnytimeCooccurrenceViewerElement } from './AnytimeCooccurrenceViewerElement';

export { AnytimeCooccurrenceViewerElement };
export type {
  CooccurrenceExportPngDetail,
  CooccurrenceFileDetail,
} from './AnytimeCooccurrenceViewerElement';

if (typeof customElements !== 'undefined' && !customElements.get('anytime-cooccurrence-viewer')) {
  customElements.define('anytime-cooccurrence-viewer', AnytimeCooccurrenceViewerElement);
}
