/**
 * `ui-core` の `createSelect`（button + ポータル listbox）を操作するテストヘルパ。
 *
 * ネイティブ `<select>` の `value = x; dispatchEvent('change')` に相当する操作が使えないため、
 * 「combobox をクリック → listbox の項目をクリック」を関数化する。
 * listbox は `portalTarget`（既定 `document.body`）へ出るので、`container` ではなく
 * `document.body` から引く点に注意する。
 *
 * ファイル名を `*.test.ts` にしていないのは、jest の `testMatch` に拾わせないため。
 */

/** combobox（`createSelect` が返す button）を testId で引く。 */
export function combobox(container: HTMLElement, testId: string): HTMLButtonElement {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`combobox not found: ${testId}`);
  if (el.getAttribute('role') !== 'combobox') {
    // 生の <select> へ戻ると気付かないまま検査対象が変わるので、ここで落とす。
    throw new Error(`not a combobox (role=${el.getAttribute('role')}): ${testId}`);
  }
  return el as HTMLButtonElement;
}

/** combobox の現在値（closed 表示のラベル）。 */
export function comboboxLabel(container: HTMLElement, testId: string): string {
  return combobox(container, testId).textContent?.trim() ?? '';
}

/** 開いている listbox の項目を全て返す（ラベルと無効状態）。 */
export function openOptions(
  container: HTMLElement,
  testId: string,
): ReadonlyArray<{ label: string; disabled: boolean; el: HTMLElement }> {
  // createSelect は mousedown で開く（click では開かない）。
  combobox(container, testId).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return [...document.body.querySelectorAll('[role="option"]')].map((el) => ({
    label: el.textContent?.trim() ?? '',
    disabled: el.getAttribute('aria-disabled') === 'true',
    el: el as HTMLElement,
  }));
}

/** listbox を開いてラベル一致の項目をクリックする（見つからなければ落とす）。 */
export function chooseOption(container: HTMLElement, testId: string, label: string): void {
  const options = openOptions(container, testId);
  const target = options.find((o) => o.label === label);
  if (!target) {
    throw new Error(
      `option not found: "${label}" in [${options.map((o) => o.label).join(', ')}]`,
    );
  }
  target.el.click();
}
