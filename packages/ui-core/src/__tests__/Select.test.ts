/**
 * createSelect の無効な選択肢（`SelectOption.disabled`）。
 *
 * 追加の出所（2026-08-05）: 「前提が揃っていないので今は選べない」を表すために、
 * 選択肢を消さずに不活性へ落とす必要があった（消すと「その機能が無い」と読める）。
 * クリック経路とキーボード経路の**両方**で弾けていないと、片方から選べてしまう。
 */
import { createSelect } from '../Select';

type Value = 'a' | 'b';

function mount(opts: { disabledB?: boolean; onChange?: (v: Value) => void }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = createSelect<Value>({
    value: 'a',
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo', disabled: opts.disabledB ?? false },
    ],
    onChange: opts.onChange,
    ariaLabel: 'test-select',
  });
  container.appendChild(handle.el);
  return { container, handle };
}

/** createSelect は mousedown で開く（click では開かない）。 */
function open(el: HTMLElement): HTMLElement[] {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[];
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('createSelect: 無効な選択肢', () => {
  it('無効な選択肢にも aria-disabled が付き、一覧からは消えない', () => {
    const { handle } = mount({ disabledB: true });
    const options = open(handle.el);
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Alpha', 'Bravo']);
    expect(options[1]?.getAttribute('aria-disabled')).toBe('true');
    handle.destroy();
  });

  it('有効な選択肢には aria-disabled を付けない', () => {
    const { handle } = mount({ disabledB: false });
    const options = open(handle.el);
    expect(options[1]?.getAttribute('aria-disabled')).toBeNull();
    handle.destroy();
  });

  it('無効な選択肢をクリックしても onChange を呼ばない', () => {
    const seen: Value[] = [];
    const { handle } = mount({ disabledB: true, onChange: (v) => seen.push(v) });
    const options = open(handle.el);
    options[1]?.click();
    expect(seen).toEqual([]);
    handle.destroy();
  });

  it('有効な選択肢をクリックすれば onChange を呼ぶ（対照）', () => {
    const seen: Value[] = [];
    const { handle } = mount({ disabledB: false, onChange: (v) => seen.push(v) });
    const options = open(handle.el);
    options[1]?.click();
    expect(seen).toEqual(['b']);
    handle.destroy();
  });

  it('キーボードでも無効な選択肢は確定しない', () => {
    const seen: Value[] = [];
    const { handle } = mount({ disabledB: true, onChange: (v) => seen.push(v) });
    const options = open(handle.el);
    const listbox = document.body.querySelector('[role="listbox"]');
    expect(listbox).toBeTruthy();
    // 末尾（無効な Bravo）へ送ろうとしてから確定を試みる。MenuList は無効項目を
    // スキップするためカーソルは Bravo に乗らず、Enter は有効な項目を確定する。
    // ここで固定したいのは「b は決して確定しない」ことである。
    for (let i = 0; i < options.length + 2; i += 1) {
      listbox!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    listbox!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(seen).not.toContain('b');
    handle.destroy();
  });
});
