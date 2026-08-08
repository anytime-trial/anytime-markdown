import type { RenderNode } from '../types';
import { boxesOverlap, createLabelWidthCache, selectVisibleLabels } from '../render/labels';

const CANVAS = { width: 1400, height: 900 };

function node(index: number, label: string, x: number, frequency: number): RenderNode {
  return {
    index,
    layer: 0,
    label,
    frequency,
    clusterIndex: undefined,
    x,
    y: 0,
    radius: 30,
    fill: '#fff',
    stroke: '#000',
    strokeWidth: 2,
    labelFontSize: 12,
    cooccurrenceCount: 0,
    isSubject: false,
    hasNote: false,
  };
}

describe('label placement', () => {
  it('detects overlap between label boxes', () => {
    expect(boxesOverlap(
      { nodeIndex: 0, layer: 0, text: 'A', x: 0, y: 0, width: 20, height: 20, fontSize: 12 },
      { nodeIndex: 1, layer: 0, text: 'B', x: 10, y: 10, width: 20, height: 20, fontSize: 12 },
    )).toBe(true);
  });

  it('keeps higher frequency labels and drops overlapping lower frequency labels', () => {
    const labels = selectVisibleLabels({
      nodes: [node(0, 'high', 0, 10), node(1, 'low', 2, 1), node(2, 'far', 100, 2)],
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      measure: (text, fontSize) => text.length * 8 * (fontSize / 12),
      padding: 2,
      ...CANVAS,
    });
    expect(labels.map((label) => label.nodeIndex)).toEqual([0, 2]);
  });

  it('shows more labels after zoom separates screen-space boxes', () => {
    const nodes = [node(0, 'first', 0, 10), node(1, 'second', 24, 9)];
    const measure = (text: string, fontSize: number): number => text.length * 8 * (fontSize / 12);
    const common = { nodes, measure, padding: 2, ...CANVAS };
    const zoomedOut = selectVisibleLabels({ ...common, viewport: { scale: 1, offsetX: 0, offsetY: 0 } });
    const zoomedIn = selectVisibleLabels({ ...common, viewport: { scale: 4, offsetX: 0, offsetY: 0 } });
    expect(zoomedOut).toHaveLength(1);
    expect(zoomedIn).toHaveLength(2);
  });

  it('drops nodes outside the canvas before measuring them', () => {
    const measured: string[] = [];
    const measure = (text: string, fontSize: number): number => {
      measured.push(text);
      return text.length * 8 * (fontSize / 12);
    };
    const labels = selectVisibleLabels({
      nodes: [node(0, 'onscreen', 100, 10), node(1, 'offscreen', 9000, 9)],
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      measure,
      ...CANVAS,
    });
    expect(labels.map((label) => label.text)).toEqual(['onscreen']);
    // 画面外の語は測りもしない（測定が全ノードに比例するのが遅さの原因だった）
    expect(measured).not.toContain('offscreen');
  });

  it('does not let an offscreen node reserve the spot of an onscreen one', () => {
    // 画面外（x=9000）の高頻度ノードは、画面内の低頻度ノードの位置を奪わない
    const labels = selectVisibleLabels({
      nodes: [node(0, 'offscreen', 9000, 99), node(1, 'onscreen', 0, 1)],
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
      measure: (text, fontSize) => text.length * 8 * (fontSize / 12),
      ...CANVAS,
    });
    expect(labels.map((label) => label.text)).toEqual(['onscreen']);
  });

  it('measures each label once and reuses the width across calls', () => {
    let calls = 0;
    const measure = (text: string, fontSize: number): number => {
      calls += 1;
      return text.length * 8 * (fontSize / 12);
    };
    const widthCache = createLabelWidthCache();
    const input = {
      nodes: [node(0, 'alpha', 0, 10), node(1, 'beta', 400, 9)],
      measure,
      widthCache,
      ...CANVAS,
    };
    selectVisibleLabels({ ...input, viewport: { scale: 1, offsetX: 0, offsetY: 0 } });
    expect(calls).toBe(2);

    // 拡大率が変わっても測り直さない（幅は font-size に比例させる）
    selectVisibleLabels({ ...input, viewport: { scale: 4, offsetX: 0, offsetY: 0 } });
    expect(calls).toBe(2);
  });

  it('scales the cached width with the font size', () => {
    const widthCache = createLabelWidthCache();
    const measure = (text: string, fontSize: number): number => text.length * fontSize;
    const nodes = [node(0, 'abcd', 0, 10)];
    const [small] = selectVisibleLabels({
      nodes, measure, widthCache, padding: 0, ...CANVAS,
      viewport: { scale: 1, offsetX: 0, offsetY: 0 },
    });
    const [large] = selectVisibleLabels({
      nodes, measure, widthCache, padding: 0, ...CANVAS,
      viewport: { scale: 4, offsetX: 0, offsetY: 0 },
    });
    // labelFontSize 12 * sqrt(scale): 12px → 24px。幅は文字数 * fontSize なので 48 → 96
    expect(small?.width).toBeCloseTo(48, 5);
    expect(large?.width).toBeCloseTo(96, 5);
  });

  it('keeps the same result as a brute-force scan on a dense field', () => {
    // グリッドの取りこぼし（隣接セルを見落とす）を、総当たりとの一致で検査する
    const nodes = Array.from({ length: 400 }, (_, i) =>
      node(i, `label-${i}`, (i % 20) * 70 - 700, 400 - i));
    const positioned = nodes.map((n, i) => ({ ...n, y: Math.floor(i / 20) * 45 - 450 }));
    const measure = (text: string, fontSize: number): number => text.length * 6 * (fontSize / 12);
    const viewport = { scale: 1, offsetX: 700, offsetY: 450 };

    const actual = selectVisibleLabels({ nodes: positioned, viewport, measure, ...CANVAS });

    const bruteForce: typeof actual = [];
    for (const candidate of actual.length === 0 ? [] : [...positioned].sort((a, b) =>
      (b.frequency - a.frequency) || (a.index - b.index))) {
      const fontSize = Math.max(10, candidate.labelFontSize * Math.sqrt(viewport.scale));
      const width = measure(candidate.label, fontSize) + 8;
      const height = fontSize + 8;
      const box = {
        nodeIndex: candidate.index, layer: candidate.layer, text: candidate.label,
        x: candidate.x * viewport.scale + viewport.offsetX - width / 2,
        y: candidate.y * viewport.scale + viewport.offsetY - height / 2,
        width, height, fontSize,
      };
      if (!bruteForce.some((other) => boxesOverlap(other, box))) bruteForce.push(box);
    }

    expect(actual.map((label) => label.nodeIndex)).toEqual(bruteForce.map((label) => label.nodeIndex));
    expect(actual.length).toBeGreaterThan(10);
  });
});
