import type { RenderNode, ViewportState } from '../types';
import { worldToScreen } from '../viewport/viewport';

export interface LabelBox {
  nodeIndex: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface LabelMeasure {
  (text: string, fontSize: number): number;
}

export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function selectVisibleLabels(
  nodes: readonly RenderNode[],
  viewport: ViewportState,
  measure: LabelMeasure,
  padding = 4,
): LabelBox[] {
  const selected: LabelBox[] = [];
  const ordered = [...nodes].sort((a, b) => {
    const byFrequency = b.frequency - a.frequency;
    return byFrequency !== 0 ? byFrequency : a.index - b.index;
  });

  for (const node of ordered) {
    const center = worldToScreen({ x: node.x, y: node.y }, viewport);
    const fontSize = Math.max(10, node.labelFontSize * Math.sqrt(viewport.scale));
    const width = measure(node.label, fontSize) + padding * 2;
    const height = fontSize + padding * 2;
    const candidate: LabelBox = {
      nodeIndex: node.index,
      text: node.label,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      fontSize,
    };
    if (!selected.some((box) => boxesOverlap(box, candidate))) selected.push(candidate);
  }

  return selected;
}
