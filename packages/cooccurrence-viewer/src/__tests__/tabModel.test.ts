import { COOC_TAB_IDS, nextTabId, panelStateAfterSelect } from '../ui/tabModel';

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

  // アイコン列は縦に並ぶ（仕様 §3.5）。縦に並ぶ列で上下キーが効かないと、見た目の並びと
  // キーの向きが食い違い、支援技術の利用者が並びを辿れない。
  it('moves along the vertical order with ArrowDown and ArrowUp', () => {
    expect(nextTabId('minimap', 'ArrowDown', ALL)).toBe('filter');
    expect(nextTabId('filter', 'ArrowUp', ALL)).toBe('minimap');
  });

  it('wraps around at the ends with the vertical keys too', () => {
    expect(nextTabId('export', 'ArrowDown', ALL)).toBe('minimap');
    expect(nextTabId('minimap', 'ArrowUp', ALL)).toBe('export');
  });

  it('jumps to the first and last tab with Home and End', () => {
    expect(nextTabId('edit', 'Home', ALL)).toBe('minimap');
    expect(nextTabId('minimap', 'End', ALL)).toBe('export');
  });

  it('returns null for keys that must not move the selection', () => {
    const untouched: ReadonlyArray<string> = ['Tab', 'Enter', ' ', 'a'];
    for (const key of untouched) expect(nextTabId('filter', key, ALL)).toBeNull();
  });

  // 保存も PNG も提供しないホストでは保存タブを出さない（仕様 §3.5・§6.3）。矢印キーが
  // 存在しないタブを選ぶと、内容の無いタブへ移って操作が止まる。
  it('skips tabs that are not displayed', () => {
    expect(nextTabId('edit', 'ArrowDown', WITHOUT_EXPORT)).toBe('minimap');
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

describe('cooccurrence panel state after selecting an icon', () => {
  it('opens the selected tab when another icon is chosen', () => {
    expect(panelStateAfterSelect({ activeId: 'minimap', expanded: true }, 'edit'))
      .toEqual({ activeId: 'edit', expanded: true });
  });

  it('collapses the panel when the selected icon is chosen again', () => {
    // 図を広く使いたいときの畳み方。図の上に開閉ボタンを置かない代わりの経路（仕様 §3.5）。
    expect(panelStateAfterSelect({ activeId: 'edit', expanded: true }, 'edit'))
      .toEqual({ activeId: 'edit', expanded: false });
  });

  it('reopens the same tab from the collapsed state', () => {
    // 畳んだ状態では選択中のアイコンが無い。同じアイコンを押したら畳み直すのではなく開く。
    expect(panelStateAfterSelect({ activeId: 'edit', expanded: false }, 'edit'))
      .toEqual({ activeId: 'edit', expanded: true });
  });

  it('opens another tab directly from the collapsed state', () => {
    expect(panelStateAfterSelect({ activeId: 'edit', expanded: false }, 'filter'))
      .toEqual({ activeId: 'filter', expanded: true });
  });
});
