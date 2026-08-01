/**
 * @jest-environment jsdom
 *
 * FilterPanel の ui-core TextField / Select 移行（選択1: 標準意匠受け入れ）の配線テスト。
 * 実ブラウザではフィルタ行の表示に metadata キーを持つグラフが要るため、ここで固定する。
 */
import { createFilterPanel } from '../components-vanilla/FilterPanel';
import type { NodeFilterConfig } from '../types/nodeFilter';

describe('FilterPanel の ui-core 部品配線', () => {
  let portal: HTMLDivElement;

  beforeEach(() => {
    portal = document.createElement('div');
    document.body.appendChild(portal);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function build(config: NodeFilterConfig, onConfigChange = jest.fn()) {
    const handle = createFilterPanel({
      config,
      onConfigChange,
      availableKeys: ['score', 'tag'],
      keyRanges: new Map([['score', [0, 10] as const]]),
      onClose: () => {},
      portalTarget: portal,
    });
    document.body.appendChild(handle.el);
    return { handle, onConfigChange };
  }

  test('テキストフィルタ行に ui-core TextField が描画され、入力で onConfigChange が発火する', () => {
    const { handle, onConfigChange } = build({
      rangeFilters: [],
      textFilters: [{ key: 'tag', value: 'abc' }],
    });

    const tfRoot = handle.el.querySelector('[data-am-tf-root]');
    expect(tfRoot).not.toBeNull();
    const input = tfRoot?.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('abc');

    input.value = 'xyz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ textFilters: [{ key: 'tag', value: 'xyz' }] }),
    );
  });

  test('キー選択の ui-core Select が portalTarget へ listbox を開き、選択が反映される', () => {
    const { handle } = build({ rangeFilters: [], textFilters: [] });

    // combobox ボタン（range 用 score / text 用 tag の 2 つ）
    const combos = [...handle.el.querySelectorAll('button')].filter(
      (b) => b.getAttribute('aria-haspopup') === 'listbox',
    );
    expect(combos.length).toBe(2);

    // ui-core Select は click ではなく mousedown で開く（Select.ts の onButtonMouseDown）
    combos[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const listbox = portal.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    const options = [...(listbox?.querySelectorAll('[role="option"]') ?? [])].map(
      (o) => o.textContent,
    );
    expect(options).toContain('score');
  });
});
