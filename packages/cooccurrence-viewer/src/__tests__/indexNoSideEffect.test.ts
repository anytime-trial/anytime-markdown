/**
 * @jest-environment jsdom
 */
/**
 * index.ts の import が customElements.define の副作用を持たないことの検査（要件書 §3-4）。
 *
 * 登録は element.ts の責務。index 経由で mount API だけを使う既存 consumer
 * （web-app / graph 拡張）へ登録が波及すると、タグ名の衝突や二重登録の温床になる。
 * 本ファイルでは element.ts を import しないこと（import すると本検査は無意味になる）。
 */
import { AnytimeCooccurrenceViewerElement, mountCooccurrenceViewer } from '../index';

describe('index.ts の副作用分離', () => {
  it('index の import では anytime-cooccurrence-viewer が登録されない', () => {
    expect(mountCooccurrenceViewer).toBeDefined();
    expect(AnytimeCooccurrenceViewerElement).toBeDefined();
    expect(customElements.get('anytime-cooccurrence-viewer')).toBeUndefined();
  });
});
