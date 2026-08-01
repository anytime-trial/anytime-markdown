/**
 * @jest-environment jsdom
 */
import { getCanvasColors } from '@anytime-markdown/graph-core';

import { applyGraphUiThemeVars, chromeColorPalette, getPalette } from '../ui/tokens';

describe('chromeColorPalette', () => {
  test.each([[true], [false]])('isDark=%s: 出典は getPalette（= getCanvasColors）と一致する', (isDark) => {
    const p = getPalette(isDark);
    const c = getCanvasColors(isDark);
    const chrome = chromeColorPalette(isDark);

    expect(chrome.textPrimary).toBe(c.textPrimary);
    expect(chrome.textSecondary).toBe(c.textSecondary);
    expect(chrome.bgPaper).toBe(c.panelBg);
    expect(chrome.bgDefault).toBe(c.modalBg);
    expect(chrome.divider).toBe(c.panelBorder);
    expect(chrome.actionHover).toBe(c.hoverBg);
    expect(chrome.primaryMain).toBe(c.accentColor);
    expect(chrome.primaryContrast).toBe(p.primaryContrast);
    expect(chrome.errorMain).toBe(p.errorMain);
    // gv の menu アイコン（.gv-list-item-icon）は text-secondary。ui-core 側で同スロットを
    // 担う action-active を同値にし、フェーズ3 移行時の視覚不変を固定する。
    expect(chrome.actionActive).toBe(c.textSecondary);
  });
});

describe('applyGraphUiThemeVars', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
  });

  test('chromeRoot 指定時: --am-color-* は chromeRoot のみ・documentElement には --gv-* のみ', () => {
    const chromeRoot = document.createElement('div');
    applyGraphUiThemeVars(true, chromeRoot);

    const html = document.documentElement;
    expect(html.style.getPropertyValue('--gv-color-bg-paper')).toBe(getCanvasColors(true).panelBg);
    // スコープ方式: web-app が documentElement に置く --am-* を奪わない
    expect(html.style.getPropertyValue('--am-color-bg-paper')).toBe('');
    expect(html.style.getPropertyValue('--am-color-text-primary')).toBe('');

    expect(chromeRoot.style.getPropertyValue('--am-color-bg-paper')).toBe(getCanvasColors(true).panelBg);
    expect(chromeRoot.style.getPropertyValue('--am-color-text-primary')).toBe(getCanvasColors(true).textPrimary);
    // 派生トークン（ui-core が算出）も届いている
    expect(chromeRoot.style.getPropertyValue('--am-color-slider-rail')).not.toBe('');
    // 寸法トークンも chromeRoot に入る（ui-core コンポーネントの radius / elevation 参照先）
    expect(chromeRoot.style.getPropertyValue('--am-radius-md')).toBe('8px');
    // gv メニュー意匠の寸法（旧 .gv-menu-item / .gv-list-item-icon）を ui-core の
    // メニュー系変数で再現する（graphMenu ラッパーの paperStyle と対）
    expect(chromeRoot.style.getPropertyValue('--am-menu-item-minh')).toBe('0px');
    expect(chromeRoot.style.getPropertyValue('--am-menu-item-font')).toBe('0.875rem');
    expect(chromeRoot.style.getPropertyValue('--am-menu-icon-minw')).toBe('28px');
  });

  test('chromeRoot 省略時（後方互換）: --gv-* のみ適用され例外を出さない', () => {
    applyGraphUiThemeVars(false);
    const html = document.documentElement;
    expect(html.style.getPropertyValue('--gv-color-bg-paper')).toBe(getCanvasColors(false).panelBg);
    expect(html.style.getPropertyValue('--am-color-bg-paper')).toBe('');
  });

  test('テーマ切替の再適用で chromeRoot の値が追従する', () => {
    const chromeRoot = document.createElement('div');
    applyGraphUiThemeVars(true, chromeRoot);
    applyGraphUiThemeVars(false, chromeRoot);
    expect(chromeRoot.style.getPropertyValue('--am-color-text-primary')).toBe(
      getCanvasColors(false).textPrimary,
    );
  });
});
