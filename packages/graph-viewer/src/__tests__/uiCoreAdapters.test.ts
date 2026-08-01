/**
 * @jest-environment jsdom
 *
 * uiCoreAdapters の gv 意匠オーバーレイの特性化テスト。
 * 実ブラウザ到達コストが高い部品（Chip はフィルタ設定時のみ表示）について、
 * 旧 .gv-* CSS の定数値がアダプタ出力へ反映されていることを固定する。
 */
import { button, chip, divider } from '../ui/uiCoreAdapters';

describe('chip（旧 .gv-chip / .gv-chip--small）', () => {
  test('small: 高さ 20 / padding 0 6 / radius 12 / font 0.6875rem / action-selected 背景', () => {
    const el = chip({ label: 'key', size: 'small' });
    expect(el.style.height).toBe('20px');
    expect(el.style.padding).toBe('0px 6px');
    expect(el.style.borderRadius).toBe('12px');
    expect(el.style.fontSize).toBe('0.6875rem');
    expect(el.style.backgroundColor).toBe('var(--am-color-action-selected)');
    expect(el.textContent).toBe('key');
  });

  test('medium: 高さ 24 / padding 0 8 / font 0.75rem', () => {
    const el = chip({ label: 'k' });
    expect(el.style.height).toBe('24px');
    expect(el.style.padding).toBe('0px 8px');
    expect(el.style.fontSize).toBe('0.75rem');
  });
});

describe('button（旧 .gv-btn）', () => {
  test('outlined small: radius 4 / weight 500 / pad 3 8 / minH 26 / divider 枠', () => {
    const el = button({ variant: 'outlined', size: 'small', children: 'Reset' });
    expect(el.style.borderRadius).toBe('4px');
    expect(el.style.fontWeight).toBe('500');
    expect(el.style.padding).toBe('3px 8px');
    expect(el.style.minHeight).toBe('26px');
    expect(el.style.borderColor).toBe('var(--am-color-divider)');
  });

  test('disabled: opacity 0.5 で hover リスナーを張らない', () => {
    const el = button({ disabled: true, children: 'x' });
    expect(el.disabled).toBe(true);
    expect(el.style.opacity).toBe('0.5');
    el.dispatchEvent(new Event('pointerenter'));
    expect(el.style.backgroundColor).not.toBe('var(--am-color-action-hover)');
  });

  test('hover で action-hover 背景・離脱で透明へ戻る', () => {
    const el = button({ children: 'x' });
    el.dispatchEvent(new Event('pointerenter'));
    expect(el.style.backgroundColor).toBe('var(--am-color-action-hover)');
    el.dispatchEvent(new Event('pointerleave'));
    expect(el.style.backgroundColor).toBe('transparent');
  });
});

describe('divider（旧 .gv-divider）', () => {
  test('既定 margin 4px 0 を維持し、呼び元 style が優先される', () => {
    expect(divider().style.margin).toBe('4px 0px');
    expect(divider({ style: { margin: '8px 0' } }).style.margin).toBe('8px 0px');
  });
});
