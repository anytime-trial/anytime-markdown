import { COOC_TAB_IDS, nextTabId } from '../ui/tabModel';

const ALL = COOC_TAB_IDS;
/** 保存タブを出せないホスト（capability なし）で表示されるタブ。 */
const WITHOUT_EXPORT = ['minimap', 'filter', 'edit'] as const;

describe('cooccurrence tab model', () => {
  it('lists the tabs in display order', () => {
    // 先頭はミニマップ。既定タブもこの並びの先頭に従う（仕様 §3.5）。
    expect(COOC_TAB_IDS).toEqual(['minimap', 'filter', 'edit', 'export']);
  });

  it('moves to the next tab with ArrowRight', () => {
    expect(nextTabId('minimap', 'ArrowRight', ALL)).toBe('filter');
    expect(nextTabId('filter', 'ArrowRight', ALL)).toBe('edit');
  });

  it('wraps around at the ends', () => {
    expect(nextTabId('export', 'ArrowRight', ALL)).toBe('minimap');
    expect(nextTabId('minimap', 'ArrowLeft', ALL)).toBe('export');
  });

  it('jumps to the first and last tab with Home and End', () => {
    expect(nextTabId('edit', 'Home', ALL)).toBe('minimap');
    expect(nextTabId('minimap', 'End', ALL)).toBe('export');
  });

  it('returns null for keys that must not move the selection', () => {
    const untouched: ReadonlyArray<string> = ['ArrowUp', 'ArrowDown', 'Tab', 'a'];
    for (const key of untouched) expect(nextTabId('filter', key, ALL)).toBeNull();
  });

  // 保存も PNG も提供しないホストでは保存タブを出さない（仕様 §3.5・§6.3）。矢印キーが
  // 存在しないタブを選ぶと、内容の無いタブへ移って操作が止まる。
  it('skips tabs that are not displayed', () => {
    expect(nextTabId('edit', 'ArrowRight', WITHOUT_EXPORT)).toBe('minimap');
    expect(nextTabId('minimap', 'ArrowLeft', WITHOUT_EXPORT)).toBe('edit');
    expect(nextTabId('minimap', 'End', WITHOUT_EXPORT)).toBe('edit');
  });

  it('falls back to the first displayed tab when the current one is gone', () => {
    // capability が外れて保存タブが消えた直後に矢印キーが来る経路。選択を動かさないと
    // どのキーを押しても反応しない状態になる。
    expect(nextTabId('export', 'ArrowRight', WITHOUT_EXPORT)).toBe('minimap');
    expect(nextTabId('export', 'ArrowLeft', WITHOUT_EXPORT)).toBe('minimap');
  });

  it('returns null when no tab is displayed', () => {
    expect(nextTabId('filter', 'ArrowRight', [])).toBeNull();
  });
});
