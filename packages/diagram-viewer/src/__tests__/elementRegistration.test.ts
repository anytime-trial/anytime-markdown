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
    const first = customElements.get(TAG);
    /*
      **モジュールの記録を捨ててから読み直す。** `import()` は評価結果を覚えているので、
      そのまま 2 度目を書いても本体は一度も走らず、`customElements.get` のガードが偽になる
      状況が検査中に一度も起きない（ガードを丸ごと外しても緑のまま通る）。

      ガードは実在の保護で、配布物では ESM と IIFE が同じページに載る事故が起こり得る。
    */
    jest.resetModules();
    await expect(import('../element')).resolves.toBeDefined();
    // 最初の登録が残っている＝再定義が走っていない（走れば NotSupportedError で落ちる）。
    expect(customElements.get(TAG)).toBe(first);
  });
});
