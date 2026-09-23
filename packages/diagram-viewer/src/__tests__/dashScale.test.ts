/**
 * 図の線の破線が、どの倍率でも破線に見えるか。
 *
 * 線の層（`.anytime-diagram-edges` / `.anytime-diagram-links`）は図と一緒に縮む。刻みを
 * 図の座標の定数（`8 5` など）で書くと、20% では画面上 1〜2px になり、丸い線端が隙間を埋めて
 * 実線に見える。倍率で割るだけでも足りない — 線幅は `clamp` で上下限を持つので、拡大側では
 * 線幅だけが画面上で太り、線端が刻みの隙間を埋める。
 *
 * 刻みは**線幅の倍数**で書く。こうすると倍率がどこにあっても線幅と刻みの比が変わらない。
 */

import { DIAGRAM_STYLES } from '../theme/diagramStyles';

interface Rule {
  readonly selector: string;
  readonly body: string;
}

/** コメントを剥がして `selector { body }` の組に割る（入れ子の無い平らな CSS 前提）。 */
function rulesOf(css: string): readonly Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return stripped.split('}').flatMap((chunk) => {
    const open = chunk.indexOf('{');
    if (open < 0) return [];
    return [{ selector: chunk.slice(0, open).trim(), body: chunk.slice(open + 1) }];
  });
}

const SCALED_LAYERS = ['.anytime-diagram-edges', '.anytime-diagram-links'];

function dashRulesInScaledLayers(): readonly { selector: string; value: string }[] {
  return rulesOf(DIAGRAM_STYLES)
    .filter((rule) => SCALED_LAYERS.some((layer) => rule.selector.startsWith(layer)))
    .flatMap((rule) => {
      const match = /stroke-dasharray:\s*([^;]+);/.exec(rule.body);
      return match === null ? [] : [{ selector: rule.selector, value: match[1].trim() }];
    });
}

describe('線の層の破線', () => {
  it('破線の規則が線の層に在る（検査が空振りしていない）', () => {
    expect(dashRulesInScaledLayers().length).toBeGreaterThanOrEqual(4);
  });

  it('刻みはすべて線幅の倍数で書く（none を除く）', () => {
    for (const { selector, value } of dashRulesInScaledLayers()) {
      if (value === 'none') continue;
      const terms = value.split(/\s+(?=calc\()/);
      expect([selector, terms.length]).toEqual([selector, 2]);
      for (const term of terms) {
        expect([selector, term]).toEqual([
          selector,
          expect.stringMatching(/^calc\(var\(--diagram-line-w\) \* [\d.]+\)$/),
        ]);
      }
    }
  });

  it('隙間は線幅より広い（丸い線端が隙間を埋めない）', () => {
    for (const { selector, value } of dashRulesInScaledLayers()) {
      if (value === 'none') continue;
      const gap = Number(/\* ([\d.]+)\)$/.exec(value)?.[1]);
      // 丸い線端は両側へ線幅の半分ずつ伸びるので、見える隙間は gap - 1。
      expect([selector, gap > 1.5]).toEqual([selector, true]);
    }
  });

  it('線幅の値を線の層で定義している', () => {
    for (const layer of SCALED_LAYERS) {
      const own = rulesOf(DIAGRAM_STYLES).find((rule) => rule.selector === layer);
      expect([layer, own?.body.includes('--diagram-line-w:')]).toEqual([layer, true]);
    }
  });
});
