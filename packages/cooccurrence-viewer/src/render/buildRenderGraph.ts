import { readLink, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import type { RenderGraph, RenderLink, RenderNode, ThemeMode } from '../types';
import { NODE_STROKE_NORMAL, NODE_STROKE_SUBJECT, labelFontSizeForRadius, radiusForFrequency, widthForStrength } from './scales';
import { withAlpha } from './color';
import { clusterColor } from '../theme/readTheme';

function buildClusterIndex(file: CooccurrenceFile): Map<number, number> {
  const index = new Map<number, number>();
  file.spec.clusters?.forEach((cluster, clusterIndex) => {
    cluster.members.forEach((member) => {
      if (!index.has(member)) index.set(member, clusterIndex);
    });
  });
  return index;
}

export function buildRenderGraph(
  file: CooccurrenceFile,
  visibleNodeIndexes: ReadonlySet<number>,
  visibleLinkIndexes: ReadonlySet<number>,
  positions: readonly [number, number][],
  themeTarget: HTMLElement,
  mode: ThemeMode,
): RenderGraph {
  const frequencies = file.spec.nodes.map((node) => node.frequency);
  const freqMin = frequencies.length > 0 ? Math.min(...frequencies) : 0;
  const freqMax = frequencies.length > 0 ? Math.max(...frequencies) : 0;
  const views = file.spec.links.map(readLink);
  const strengths = views.map((view) => view.strength);
  const strengthMin = strengths.length > 0 ? Math.min(...strengths) : 0;
  const strengthMax = strengths.length > 0 ? Math.max(...strengths) : 0;
  const clusterIndex = buildClusterIndex(file);
  const cooccurrenceCounts = new Map<number, number>();
  for (const view of views) {
    cooccurrenceCounts.set(view.source, (cooccurrenceCounts.get(view.source) ?? 0) + 1);
    cooccurrenceCounts.set(view.target, (cooccurrenceCounts.get(view.target) ?? 0) + 1);
  }

  const nodes: RenderNode[] = [];
  file.spec.nodes.forEach((node, index) => {
    if (!visibleNodeIndexes.has(index)) return;
    const pos = positions[index] ?? [0, 0];
    const radius = radiusForFrequency(node.frequency, freqMin, freqMax);
    const color = clusterColor(themeTarget, clusterIndex.get(index), mode);
    nodes.push({
      index,
      label: node.label,
      frequency: node.frequency,
      clusterIndex: clusterIndex.get(index),
      x: pos[0],
      y: pos[1],
      radius,
      fill: withAlpha(color, mode === 'dark' ? 0.28 : 0.18),
      stroke: color,
      strokeWidth: file.spec.subject === index ? NODE_STROKE_SUBJECT : NODE_STROKE_NORMAL,
      labelFontSize: labelFontSizeForRadius(radius),
      cooccurrenceCount: cooccurrenceCounts.get(index) ?? 0,
      isSubject: file.spec.subject === index,
    });
  });

  const links: RenderLink[] = [];
  views.forEach((view, index) => {
    if (!visibleLinkIndexes.has(index)) return;
    links.push({
      index,
      source: view.source,
      target: view.target,
      strength: view.strength,
      width: widthForStrength(view.strength, strengthMin, strengthMax),
      direction: view.direction,
    });
  });

  return { nodes, links };
}
