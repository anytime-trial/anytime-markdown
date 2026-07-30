import { resolveThemeFromBodyClasses } from '../theme';

describe('resolveThemeFromBodyClasses', () => {
  it('vscode-dark を dark と判定する', () => {
    expect(resolveThemeFromBodyClasses(['vscode-dark'])).toBe('dark');
  });

  it('vscode-high-contrast（黒背景の high contrast）を dark と判定する', () => {
    expect(resolveThemeFromBodyClasses(['vscode-high-contrast'])).toBe('dark');
  });

  it('vscode-light を light と判定する', () => {
    expect(resolveThemeFromBodyClasses(['vscode-light'])).toBe('light');
  });

  it('vscode-high-contrast-light は vscode-high-contrast の部分一致に引っ張られず light と判定する', () => {
    expect(resolveThemeFromBodyClasses(['vscode-high-contrast-light'])).toBe('light');
  });

  it('該当クラスが無ければ既定で light とする', () => {
    expect(resolveThemeFromBodyClasses([])).toBe('light');
  });

  it('他クラスと混在していても該当トークンを検出する', () => {
    expect(resolveThemeFromBodyClasses(['some-other-class', 'vscode-dark', 'another'])).toBe('dark');
  });
});
