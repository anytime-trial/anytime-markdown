/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';
import { createFilterPanel } from '../ui/FilterPanel';
import { applyCooccurrenceThemeVars } from '../theme/applyCooccurrenceThemeVars';
import { clusterColor, clusterColorVarName } from '../theme/readTheme';

const t = createCooccurrenceT('Cooccurrence', 'ja');

function file(clusterCount: number): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: Array.from({ length: clusterCount }, (_, index) => ({ label: `Word ${index}`, frequency: index + 1 })),
      links: [],
      clusters: Array.from({ length: clusterCount }, (_, index) => ({ label: `Cluster ${index}`, members: [index] })),
    },
  };
}

function swatches(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.cooc-filter__swatch')];
}

function mountPanel(clusterCount: number): { element: HTMLElement; destroy(): void } {
  const panel = createFilterPanel({
    file: file(clusterCount),
    counts: { visibleNodeCount: clusterCount, totalNodeCount: clusterCount, visibleLinkCount: 0, totalLinkCount: 0 },
    t,
    onFilterChange: jest.fn(),
  });
  document.body.appendChild(panel.element);
  return { element: panel.element, destroy: () => panel.destroy() };
}

afterEach(() => document.body.replaceChildren());

describe('クラスタの色見本', () => {
  it('クラスタごとに 1 つ、グラフと同じ色変数を参照する見本が並ぶ', () => {
    const panel = mountPanel(3);

    const found = swatches(panel.element);
    expect(found).toHaveLength(3);
    found.forEach((swatch, index) => {
      expect(swatch.style.background).toBe(`var(${clusterColorVarName(index)})`);
    });

    panel.destroy();
  });

  it('クラスタが 8 を超えるとパレットが巻き戻る（グラフの割当と一致する）', () => {
    const panel = mountPanel(10);

    const found = swatches(panel.element);
    expect(found[8].style.background).toBe(found[0].style.background);
    expect(found[9].style.background).toBe(found[1].style.background);

    panel.destroy();
  });

  it('色見本は装飾なので支援技術から隠す（クラスタ名のテキストが情報の正）', () => {
    const panel = mountPanel(2);

    const found = swatches(panel.element);
    expect(found).toHaveLength(2);
    for (const swatch of found) expect(swatch.getAttribute('aria-hidden')).toBe('true');
    expect(panel.element.textContent).toContain('Cluster 0');

    panel.destroy();
  });

  // クラスタ 0 の色は `clusterColor` の未設定時フォールバック（dark #90CAF9 / light #3D4A52）と
  // 文字列が一致するため、検査に使うと変数解決が丸ごと壊れても green のまま通る。
  // フォールバックと異なる値を持つクラスタ 1 で検査する。
  it.each<['dark' | 'light', string]>([
    ['dark', '#66BB6A'],
    ['light', '#4B5A3E'],
  ])('%s モードで色変数が解決され、グラフのノード色と一致する', (mode, expected) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    applyCooccurrenceThemeVars(host, mode);

    // 見本が参照する変数名と、グラフのノードが読む色が同じ経路であることを固定する。
    expect(clusterColorVarName(1)).toBe('--cooc-cluster-1');
    expect(clusterColor(host, 1, mode)).toBe(expected);
    expect(clusterColor(host, 9, mode)).toBe(clusterColor(host, 1, mode));
  });
});
