import type { CooccurrenceFile } from './cooccurrenceFile';

export interface CooccurrenceFilterOptions {
  minFrequency?: number;
  selectedClusterIndexes?: readonly number[];
  minStrength?: number;
  topLinkCount?: number;
}

export interface CooccurrenceFilterCounts {
  visibleNodeCount: number;
  visibleLinkCount: number;
  totalNodeCount: number;
  totalLinkCount: number;
}

export interface CooccurrenceFilterResult {
  nodeIndexes: ReadonlySet<number>;
  linkIndexes: ReadonlySet<number>;
  counts: CooccurrenceFilterCounts;
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function applyClusterFilter(
  spec: CooccurrenceFile['spec'],
  visibleNodes: Set<number>,
  selectedClusterIndexes: readonly number[] | undefined,
): Set<number> {
  if (selectedClusterIndexes === undefined) return visibleNodes;

  const selected = new Set(selectedClusterIndexes);
  const selectedMembers = new Set<number>();
  const anyClusterMembers = new Set<number>();
  spec.clusters?.forEach((cluster, clusterIndex) => {
    cluster.members.forEach((member) => {
      anyClusterMembers.add(member);
      if (selected.has(clusterIndex)) selectedMembers.add(member);
    });
  });

  // 設計書 §3.2 の条件は「選択されていないクラスタの語を外す」。
  // どのクラスタにも属さない語は「選択されていないクラスタの語」ではないので残す。
  // Why not 選択クラスタのメンバーだけ残すか: 全クラスタを選んだ状態が「絞り込みなし」と
  // 一致しなくなり、利用者が触っていない条件で未所属語が黙って消える。
  return new Set(
    [...visibleNodes].filter((nodeIndex) => selectedMembers.has(nodeIndex) || !anyClusterMembers.has(nodeIndex)),
  );
}

export function filterCooccurrenceFile(
  file: CooccurrenceFile,
  options: CooccurrenceFilterOptions = {},
): CooccurrenceFilterResult {
  const minFrequency = finiteOrDefault(options.minFrequency, 1);
  const minStrength = finiteOrDefault(options.minStrength, 0);
  const topLinkCount =
    options.topLinkCount === undefined || !Number.isFinite(options.topLinkCount)
      ? undefined
      : Math.max(0, Math.floor(options.topLinkCount));

  let visibleNodes = new Set<number>();
  file.spec.nodes.forEach((node, nodeIndex) => {
    if (node.frequency >= minFrequency) visibleNodes.add(nodeIndex);
  });

  visibleNodes = applyClusterFilter(file.spec, visibleNodes, options.selectedClusterIndexes);

  let survivingLinks = file.spec.links
    .map((link, linkIndex) => ({ link, linkIndex }))
    .filter(({ link }) => visibleNodes.has(link[0]) && visibleNodes.has(link[1]))
    .filter(({ link }) => link[2] >= minStrength);

  if (topLinkCount !== undefined) {
    survivingLinks = [...survivingLinks]
      .sort((a, b) => {
        const strengthOrder = b.link[2] - a.link[2];
        return strengthOrder !== 0 ? strengthOrder : a.linkIndex - b.linkIndex;
      })
      .slice(0, topLinkCount);
  }

  const visibleLinks = new Set(survivingLinks.map(({ linkIndex }) => linkIndex));

  return {
    nodeIndexes: visibleNodes,
    linkIndexes: visibleLinks,
    counts: {
      visibleNodeCount: visibleNodes.size,
      visibleLinkCount: visibleLinks.size,
      totalNodeCount: file.spec.nodes.length,
      totalLinkCount: file.spec.links.length,
    },
  };
}
