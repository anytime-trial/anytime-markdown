/**
 * Regression: vanilla 移行（commit e42b06fde）で選択要素 詳細パネルから DSM / Metrics /
 * Community の 3 セクションが欠落した。本テストは各セクションが描画され、Matrix / Graph
 * ジャンプアイコンがコールバックを発火することを保証する。
 */
import { describe, expect, test } from '@jest/globals';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import { appendSelectedElementDetailSections, type SelectedElementDetailOptions } from '../selectedElementDetailsPanel';
import type { SelectedElementInfo } from '../selectedElementInfo';

const colors = {
  border: '#222',
  text: '#fff',
  textSecondary: '#ccc',
  textMuted: '#888',
  accent: '#4af',
  hover: '#333',
  bg: '#000',
} as const;

function makeInfo(overrides: Partial<SelectedElementInfo> = {}): SelectedElementInfo {
  return {
    element: { id: 'pkg_foo/comp', type: 'component', name: 'comp' } as SelectedElementInfo['element'],
    incoming: 2,
    outgoing: 5,
    coverage: {
      elementId: 'pkg_foo/comp',
      lines: { covered: 8, total: 10, pct: 80 },
      branches: { covered: 5, total: 10, pct: 50 },
      functions: { covered: 2, total: 4, pct: 50 },
    },
    complexity: { elementId: 'pkg_foo/comp', mostFrequent: 'high-complexity', highest: 'high-complexity', totalCount: 3 },
    importance: 88,
    defectRisk: 55,
    busFactor: null,
    busFactorUnavailable: false,
    hotspot: { elementId: 'pkg_foo/comp', churn: 42, churnNorm: 0.5, complexity: 3, complexityNorm: 0.3, risk: 0.7 },
    community: {
      elementId: 'pkg_foo/comp',
      dominantCommunity: 7,
      dominantRatio: 0.6,
      breakdown: [
        { community: 7, count: 6 },
        { community: 3, count: 4 },
        { community: 1, count: 3 },
        { community: 2, count: 2 },
        { community: 5, count: 1 }, // slice(3) → "other" 要素を描画させ floor 検証に通す
      ],
      isGodNode: true,
    },
    sizeMetrics: { loc: 120, locMax: 90, fileCount: 2, functionCount: 4 },
    layer: 'service-domain',
    ...overrides,
  };
}

function makeOpts(overrides: Partial<SelectedElementDetailOptions> = {}): SelectedElementDetailOptions {
  return {
    colors,
    t: (k: string) => k,
    isDark: true,
    codeGraph: { communities: { 7: 'Alpha', 3: 'Beta' } } as unknown as CodeGraph,
    featureMatrix: null,
    matrixIconPath: 'M0 0h24v24H0z',
    graphIconPath: 'M0 0h24v24H0z',
    onOpenMatrix: () => {},
    onOpenGraph: () => {},
    ...overrides,
  };
}

describe('appendSelectedElementDetailSections', () => {
  test('renders DSM In/Out, Metrics, and Community sections', () => {
    const host = document.createElement('div');
    appendSelectedElementDetailSections(host, makeInfo(), makeOpts());
    const text = host.textContent ?? '';

    // DSM
    expect(text).toContain('DSM');
    expect(text).toContain('In');
    expect(text).toContain('Out');
    // Metrics（i18n キーは恒等関数で素通し）
    expect(text).toContain('c4.popup.metrics');
    expect(text).toContain('c4.popup.size');
    expect(text).toContain('c4.popup.quality');
    expect(text).toContain('c4.popup.structure');
    expect(text).toContain('120(90)'); // LOC(MAX)
    expect(text).toContain('80%'); // coverage lines pct
    // Architecture layer（i18n キーは恒等関数で素通し: LAYER_LABEL_KEYS['service-domain']）
    expect(text).toContain('c4.popup.layer');
    expect(text).toContain('c4.layer.serviceDomain');
    // Community
    expect(text).toContain('c4.community.title');
    expect(text).toContain('Alpha'); // dominant community name from codeGraph
    expect(text).toContain('c4.community.hubNode'); // god node badge
    expect(text).toContain('c4.community.breakdown');
  });

  // Regression: 右パネル詳細のフォントが他パネル(左 labels 0.65rem 等)より小さく見えた問題。
  // 0.62rem 未満の極小フォントを再導入しないことを保証する（floor=0.62rem）。
  test('詳細セクションのフォントが極小(0.62rem 未満)にならない', () => {
    const host = document.createElement('div');
    appendSelectedElementDetailSections(host, makeInfo(), makeOpts());
    // breakdown 5件 → "other" 要素(本変更で 0.62rem 化)も描画され floor 検証に含まれる
    expect(host.textContent ?? '').toContain('c4.community.other');
    const tooSmall: string[] = [];
    for (const elx of Array.from(host.querySelectorAll<HTMLElement>('*'))) {
      const fs = elx.style.fontSize;
      const m = /^([0-9.]+)rem$/.exec(fs);
      if (m && Number.parseFloat(m[1]) < 0.62) tooSmall.push(fs);
    }
    expect(tooSmall).toEqual([]);
  });

  test('Matrix and Graph icon buttons fire callbacks', () => {
    const host = document.createElement('div');
    let matrixClicked = 0;
    let graphClicked = 0;
    appendSelectedElementDetailSections(
      host,
      makeInfo(),
      makeOpts({ onOpenMatrix: () => { matrixClicked++; }, onOpenGraph: () => { graphClicked++; } }),
    );
    const matrixBtn = host.querySelector('button[aria-label="viewer.tab.matrix"]') as HTMLButtonElement;
    const graphBtn = host.querySelector('button[aria-label="viewer.tab.graph"]') as HTMLButtonElement;
    expect(matrixBtn).not.toBeNull();
    expect(graphBtn).not.toBeNull();
    matrixBtn.click();
    graphBtn.click();
    expect(matrixClicked).toBe(1);
    expect(graphClicked).toBe(1);
  });

  test('shows dashes when metric data is missing and omits community when null', () => {
    const host = document.createElement('div');
    appendSelectedElementDetailSections(
      host,
      makeInfo({
        incoming: null,
        outgoing: null,
        coverage: null,
        complexity: null,
        importance: null,
        defectRisk: null,
        hotspot: null,
        community: null,
        sizeMetrics: { loc: null, locMax: null, fileCount: null, functionCount: null },
        layer: null,
      }),
      makeOpts(),
    );
    const text = host.textContent ?? '';
    expect(text).toContain('-');
    // community セクションは null のとき描画されない
    expect(text).not.toContain('c4.community.title');
    // layer 行は null のとき描画されない
    expect(text).not.toContain('c4.popup.layer');
  });
});
