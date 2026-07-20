import type { RenderNode } from '../types';
import { boxesOverlap, selectVisibleLabels } from '../render/labels';

function node(index: number, label: string, x: number, frequency: number): RenderNode {
  return {
    index,
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
  };
}

describe('label placement', () => {
  it('detects overlap between label boxes', () => {
    expect(boxesOverlap(
      { nodeIndex: 0, text: 'A', x: 0, y: 0, width: 20, height: 20, fontSize: 12 },
      { nodeIndex: 1, text: 'B', x: 10, y: 10, width: 20, height: 20, fontSize: 12 },
    )).toBe(true);
  });

  it('keeps higher frequency labels and drops overlapping lower frequency labels', () => {
    const labels = selectVisibleLabels(
      [node(0, 'high', 0, 10), node(1, 'low', 2, 1), node(2, 'far', 100, 2)],
      { scale: 1, offsetX: 0, offsetY: 0 },
      (text) => text.length * 8,
      2,
    );
    expect(labels.map((label) => label.nodeIndex)).toEqual([0, 2]);
  });

  it('shows more labels after zoom separates screen-space boxes', () => {
    const nodes = [node(0, 'first', 0, 10), node(1, 'second', 24, 9)];
    const measure = (text: string): number => text.length * 8;
    const zoomedOut = selectVisibleLabels(nodes, { scale: 1, offsetX: 0, offsetY: 0 }, measure, 2);
    const zoomedIn = selectVisibleLabels(nodes, { scale: 4, offsetX: 0, offsetY: 0 }, measure, 2);
    expect(zoomedOut).toHaveLength(1);
    expect(zoomedIn).toHaveLength(2);
  });
});
