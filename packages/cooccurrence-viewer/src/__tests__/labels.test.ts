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

  it('keeps a long label whose center is offscreen but whose text reaches the canvas', () => {
    // 中心が画面外でも、中心揃えのラベルは半幅ぶん画面に出る。粗いカリングで落としてはいけない
    const longLabel = 'a'.repeat(53);
    const measure = (text: string, fontSize: number): number => text.length * 20 * (fontSize / 12);
    const nodes = [{ ...node(0, longLabel, -250, 10), labelFontSize: 12 }];
    const labels = selectVisibleLabels({
      nodes, measure, viewport: { scale: 1, offsetX: 0, offsetY: 0 }, ...CANVAS,
    });
    // 幅 1060 の箱が中心 x=-250 に置かれ、右端は +280 で画面内
    expect(labels).toHaveLength(1);
    expect(labels[0]?.x).toBeLessThan(0);
    expect((labels[0]?.x ?? 0) + (labels[0]?.width ?? 0)).toBeGreaterThan(0);
  });

  it('drops a label whose box misses the canvas entirely even if its center is near', () => {
    const measure = (text: string, fontSize: number): number => text.length * 2 * (fontSize / 12);
    // 中心 x=-1300（粗いカリングは通る）だが箱幅は 24 なので画面には掛からない
    const nodes = [{ ...node(0, 'abcdefghijkl', -1300, 10), labelFontSize: 12 }];
    const labels = selectVisibleLabels({
      nodes, measure, viewport: { scale: 1, offsetX: 0, offsetY: 0 }, ...CANVAS,
    });
    expect(labels).toEqual([]);
  });

  it('clears the width cache instead of growing without bound', () => {
    const widthCache = createLabelWidthCache();
    const measure = (text: string, fontSize: number): number => text.length * fontSize;
    // 上限（20,000）を跨ぐまで語彙を入れ替える。件数が単調増加しないことを見る
    for (let round = 0; round < 3; round += 1) {
      const nodes = Array.from({ length: 9000 }, (_, i) =>
        node(i, `round-${round}-label-${i}`, (i % 90) * 15 - 675, 9000 - i));
      selectVisibleLabels({
        nodes, measure, widthCache, viewport: { scale: 1, offsetX: 700, offsetY: 450 }, ...CANVAS,
      });
    }
    expect(widthCache.size).toBeLessThanOrEqual(20_000);
  });

  it('keeps the same result as a brute-force scan on a colliding field', () => {
    // グリッドの取りこぼし（隣接セルを見落とす）を、総当たりとの一致で検査する。
    // 箱（幅 62 / 高さ 20）より狭い間隔に置き、実際に競合を起こすことが前提。
    const measure = (text: string, fontSize: number): number => text.length * 6 * (fontSize / 12);
    const positioned = Array.from({ length: 400 }, (_, i) => ({
      ...node(i, `label-${i}`, (i % 20) * 40 - 400, 400 - i),
      // セル境界（64px）を跨ぐ位置を混ぜる
      y: Math.floor(i / 20) * 16 - 160 + (i % 3),
    }));
    const viewport = { scale: 1, offsetX: 700, offsetY: 450 };

    const actual = selectVisibleLabels({ nodes: positioned, viewport, measure, ...CANVAS });

    const bruteForce: typeof actual = [];
    for (const candidate of [...positioned].sort((a, b) =>
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
    // 競合が実際に起きていること（全採用なら重なり判定を素通りしていて検査になっていない）
    expect(actual.length).toBeLessThan(positioned.length / 2);
    expect(actual.length).toBeGreaterThan(10);
  });
});
