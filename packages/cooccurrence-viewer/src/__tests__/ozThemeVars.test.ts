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
    expect(el.style.getPropertyValue('--cooc-cluster-7')).toBe('#7ADFA8');
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

  /**
   * 変数名の集合はスキン・モードの 4 通りで揃える。片方にだけ足すと、そのモードでだけ
   * `var(--cooc-*)` が解決できず、面が透明・線が既定色になって静かに崩れる。
   * 名前を数え上げる側でなく「全通りを突き合わせる」側で書くのは、後から足した変数を
   * 検査が見落とさないようにするため。
   */
  test('変数名の集合はスキン・モードの 4 通りで一致する', () => {
    const names = ([['standard', 'light'], ['standard', 'dark'], ['oz', 'light'], ['oz', 'dark']] as const).map(
      ([skin, mode]) => {
        const el = document.createElement('div');
        applyCooccurrenceThemeVars(el, mode, skin);
        // jsdom の CSSStyleDeclaration は反復可能ではないため、添字で取り出す。
        return Array.from({ length: el.style.length }, (_unused, index) => el.style.item(index))
          .filter((name) => !name.startsWith('--cooc-cluster-'))
          .sort();
      },
    );

    for (const set of names) expect(set).toEqual(names[0]);
    // 新しく足した変数がどのモードにも無い、という素通りを防ぐ。
    expect(names[0]).toContain('--cooc-viewport-frame');
    expect(names[0]).toContain('--cooc-viewport-fill');
    expect(names[0]).toContain('--cooc-scrim');
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
