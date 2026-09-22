/**
 * 登録の副作用の分離（`index.ts` と `element.ts`）。
 *
 * **この検査は専用のファイルでしか意味を持たない。** `element.ts` は
 * `customElements.get(タグ) === undefined` のときしか登録しないので、同じ実行環境で先に
 * タグを登録しているファイル（`AnytimeDiagramViewerElement.test.ts` の `beforeAll`）の中で
 * 測ると、`index.ts` が `element.ts` を読むように壊れても `define` は呼ばれず緑のまま通る。
 * jest はテストファイルごとに環境を分けるので、ここでは一度も登録していない状態から測る。
 */

const TAG = 'anytime-diagram-viewer';

describe('登録の副作用', () => {
  it('`index.ts` を読んでも登録は走らない', async () => {
    expect(customElements.get(TAG)).toBeUndefined();
    await import('../index');
    // 走ると、mount API だけを使う宿主（web-app / 拡張の webview / rich editor）へ
    // customElements.define が波及する。
    expect(customElements.get(TAG)).toBeUndefined();
  });

  it('`element.ts` を読むと登録が走る', async () => {
    await import('../element');
    expect(customElements.get(TAG)).toBeDefined();
  });

  it('二度読んでも登録し直さない（重複定義で throw しない）', async () => {
    await import('../element');
    await expect(import('../element')).resolves.toBeDefined();
  });
});
