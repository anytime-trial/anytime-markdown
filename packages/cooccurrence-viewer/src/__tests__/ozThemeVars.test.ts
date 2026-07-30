/**
 * @jest-environment jsdom
 */
import { applyCooccurrenceThemeVars, CLUSTER_COLORS_STANDARD } from '../theme/applyCooccurrenceThemeVars';

describe('applyCooccurrenceThemeVars: OZ スキン', () => {
  test.each([
    ['light', '#F4F5FB', '#1B2A4A'],
    ['dark', '#0A0F2E', 'rgba(255,255,255,0.92)'],
  ] as const)('oz %s は OZ 変数一式とキャンディパレットを適用する', (mode, bg, text) => {
    const el = document.createElement('div');
    applyCooccurrenceThemeVars(el, mode, 'oz');
    expect(el.style.getPropertyValue('--cooc-bg')).toBe(bg);
    expect(el.style.getPropertyValue('--cooc-text')).toBe(text);
    expect(el.style.getPropertyValue('--cooc-cluster-0')).toBe('#FF6B6B');
    expect(el.style.getPropertyValue('--cooc-cluster-7')).toBe('#4DD0E1');
  });

  test.each(['light', 'dark'] as const)('skin 省略時は現行の %s 変数のまま（回帰）', (mode) => {
    const el = document.createElement('div');
    applyCooccurrenceThemeVars(el, mode);
    expect(el.style.getPropertyValue('--cooc-bg')).toBe(mode === 'dark' ? '#0D1117' : '#F2EFE8');
    expect(el.style.getPropertyValue('--cooc-cluster-0')).toBe(CLUSTER_COLORS_STANDARD[0]);
  });

  /**
   * クラスタ色はモードで変えない。モードを切り替えると語の色まで変わる状態へ戻すと、
   * 色でクラスタを覚えられなくなる。
   */
  test('標準スキンのクラスタパレットはライトとダークで同一', () => {
    const light = document.createElement('div');
    const dark = document.createElement('div');
    applyCooccurrenceThemeVars(light, 'light');
    applyCooccurrenceThemeVars(dark, 'dark');
    for (let index = 0; index < CLUSTER_COLORS_STANDARD.length; index += 1) {
      const name = `--cooc-cluster-${index}`;
      expect(light.style.getPropertyValue(name)).toBe(dark.style.getPropertyValue(name));
    }
  });

  test('standard を明示しても skin 省略と同じ変数になる', () => {
    const explicit = document.createElement('div');
    const omitted = document.createElement('div');
    applyCooccurrenceThemeVars(explicit, 'light', 'standard');
    applyCooccurrenceThemeVars(omitted, 'light');
    expect(explicit.style.getPropertyValue('--cooc-bg')).toBe(omitted.style.getPropertyValue('--cooc-bg'));
    expect(explicit.style.getPropertyValue('--cooc-cluster-3')).toBe(omitted.style.getPropertyValue('--cooc-cluster-3'));
  });
});
