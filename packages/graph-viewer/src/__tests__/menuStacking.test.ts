/**
 * @jest-environment jsdom
 */
import { injectGraphUiStyles } from '../ui/injectStyles';

/**
 * `.gv-menu-paper` が `.gv-menu-backdrop` より前面にあることを、注入 CSS の宣言から検証する。
 *
 * jsdom は当たり判定（elementFromPoint / pointer-events）を実装しないため、
 * 「backdrop が menu 項目のクリックを奪う」回帰をレンダリング経由では検知できない。
 * z-index の大小という宣言レベルの不変条件だけは、ここで守る。
 */
function zIndexOf(selector: string): number {
  const styleEl = document.getElementById('anytime-graph-ui-styles');
  if (!(styleEl instanceof HTMLStyleElement)) throw new Error('graph ui styles not injected');
  const sheet = styleEl.sheet;
  if (!sheet) throw new Error('graph ui stylesheet not parsed');

  for (const rule of sheet.cssRules) {
    if (rule instanceof CSSStyleRule && rule.selectorText === selector) {
      const raw = rule.style.getPropertyValue('z-index');
      if (raw === '') throw new Error(`${selector} declares no z-index`);
      return Number.parseInt(raw, 10);
    }
  }
  throw new Error(`rule not found: ${selector}`);
}

describe('vanilla メニューの重なり順', () => {
  beforeAll(() => {
    injectGraphUiStyles();
  });

  it('メニュー本体は backdrop より前面に描画される', () => {
    const backdrop = zIndexOf('.gv-menu-backdrop');
    const paper = zIndexOf('.gv-menu-paper');

    expect(Number.isNaN(backdrop)).toBe(false);
    expect(Number.isNaN(paper)).toBe(false);
    // paper < backdrop だと backdrop が全項目のクリックを奪い、メニューが操作不能になる
    expect(paper).toBeGreaterThan(backdrop);
  });
});
