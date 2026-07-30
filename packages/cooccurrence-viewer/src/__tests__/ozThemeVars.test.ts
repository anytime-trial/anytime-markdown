/**
 * @jest-environment jsdom
 */
import { applyCooccurrenceThemeVars, CLUSTER_COLORS_DARK, CLUSTER_COLORS_LIGHT } from '../theme/applyCooccurrenceThemeVars';

describe('applyCooccurrenceThemeVars: OZ スキン', () => {
  test.each([
    ['light', '#FFFFFF', '#1B2A4A'],
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
    const clusters = mode === 'dark' ? CLUSTER_COLORS_DARK : CLUSTER_COLORS_LIGHT;
    expect(el.style.getPropertyValue('--cooc-cluster-0')).toBe(clusters[0]);
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
