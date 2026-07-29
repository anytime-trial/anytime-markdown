import { COOC_TAB_IDS, nextTabId } from '../ui/tabModel';

describe('cooccurrence tab model', () => {
  it('lists the tabs in display order', () => {
    expect(COOC_TAB_IDS).toEqual(['filter', 'edit']);
  });

  it('moves to the next tab with ArrowRight', () => {
    expect(nextTabId('filter', 'ArrowRight')).toBe('edit');
  });

  it('wraps around at the ends', () => {
    expect(nextTabId('edit', 'ArrowRight')).toBe('filter');
    expect(nextTabId('filter', 'ArrowLeft')).toBe('edit');
  });

  it('jumps to the first and last tab with Home and End', () => {
    expect(nextTabId('edit', 'Home')).toBe('filter');
    expect(nextTabId('filter', 'End')).toBe('edit');
  });

  it('returns null for keys that must not move the selection', () => {
    const untouched: ReadonlyArray<string> = ['ArrowUp', 'ArrowDown', 'Tab', 'a'];
    for (const key of untouched) expect(nextTabId('filter', key)).toBeNull();
  });
});
