import { applyTrailThemeVars, trailThemeCssVars } from '../applyTrailThemeVars';

describe('trailThemeCssVars', () => {
  it('dark/light で --am-color-* と --trv-color-* を導出する', () => {
    const dark = trailThemeCssVars(true);
    const light = trailThemeCssVars(false);
    // vanilla コンポーネントが参照する代表トークン
    expect(dark['--am-color-bg-default']).toBeTruthy();
    expect(dark['--am-color-text-primary']).toBeTruthy();
    expect(dark['--am-color-primary-main']).toBeTruthy();
    expect(dark['--am-color-tooltip-bg']).toBeTruthy();
    expect(dark['--am-color-switch-track-off']).toBe('#fff');
    expect(light['--am-color-switch-track-off']).toBe('#000');
    // 後方互換の --trv-* も併設
    expect(dark['--trv-color-primary-main']).toBe(dark['--am-color-primary-main']);
    // dark と light で値が異なる
    expect(dark['--am-color-bg-default']).not.toBe(light['--am-color-bg-default']);
  });

  it('vanilla が使う全 --am-color-* キーを網羅する', () => {
    const vars = trailThemeCssVars(true);
    const required = [
      '--am-color-accent',
      '--am-color-action-active',
      '--am-color-action-disabled',
      '--am-color-action-hover',
      '--am-color-action-selected',
      '--am-color-bg-default',
      '--am-color-bg-paper',
      '--am-color-border',
      '--am-color-divider',
      '--am-color-error-main',
      '--am-color-info-bg',
      '--am-color-info-main',
      '--am-color-input-border',
      '--am-color-primary',
      '--am-color-primary-bg',
      '--am-color-primary-contrast',
      '--am-color-primary-main',
      '--am-color-skeleton-bg',
      '--am-color-slider-rail',
      '--am-color-success-main',
      '--am-color-switch-thumb-off',
      '--am-color-switch-track-off',
      '--am-color-text-disabled',
      '--am-color-text-primary',
      '--am-color-text-secondary',
      '--am-color-tooltip-bg',
      '--am-color-tooltip-text',
      '--am-color-warning',
      '--am-color-warning-main',
    ];
    for (const key of required) {
      expect(vars[key]).toBeTruthy();
    }
  });

  it('applyTrailThemeVars が documentElement に設定する', () => {
    applyTrailThemeVars(true);
    const v = document.documentElement.style.getPropertyValue('--am-color-bg-default');
    expect(v).toBeTruthy();
  });
});
