import { readLink, type CooccurrenceFile } from './cooccurrenceFile';
import { readCooccurrenceSliceValue } from './cooccurrenceTimeline';

/** サブクラスタの指し方。サブクラスタはクラスタの中でしか一意にならないため、対で指す。 */
export interface CooccurrenceSubclusterRef {
  cluster: number;
  subcluster: number;
}

export interface CooccurrenceFilterOptions {
  minFrequency?: number;
  selectedClusterIndexes?: readonly number[];
  /**
   * 表示するサブクラスタ（設計書 §3.2）。`undefined` は全表示（サブクラスタで絞らない）。
   *
   * クラスタの選択とは独立に効く。クラスタを外せばその中の語は全て消え、クラスタを残したまま
   * サブクラスタを外すと、そのサブクラスタの語だけが消える。
   */
  selectedSubclusters?: readonly CooccurrenceSubclusterRef[];
  minStrength?: number;
  topLinkCount?: number;
  /**
   * 対象のスライス（レイヤー表示。設計書 §3.6.5）。指定すると、絞り込みの基準になる値が
   * 全体値ではなくそのスライスの値になり、そのスライスに存在しない語と共起は最初から外れる。
   *
   * Why not 全体値で絞ってからスライスの有無だけを見るか: あるスライスで 1 回しか現れない語が、
   * 全期間で 50 回現れることを理由に全レイヤーへ描かれる。絞り込みは「今見ている図から何を
   * 落とすか」の操作であり、レイヤー表示で見ている図はスライスである。
   */
  sliceIndex?: number;
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

function subclusterKey(cluster: number, subcluster: number): string {
  return `${cluster}:${subcluster}`;
}

/**
 * サブクラスタによる絞り込み。クラスタ側（`applyClusterFilter`）と同じ規則で書く。
 *
 * どのサブクラスタにも属さない語（クラスタ直下の残余）は「選択されていないサブクラスタの語」では
 * ないので残す。クラスタ側で未所属語を残したのと同じ理由で、全サブクラスタを選んだ状態が
 * 「絞り込みなし」と一致しなくなるのを避ける。
 */
function applySubclusterFilter(
  spec: CooccurrenceFile['spec'],
  visibleNodes: Set<number>,
  selectedSubclusters: readonly CooccurrenceSubclusterRef[] | undefined,
): Set<number> {
  if (selectedSubclusters === undefined) return visibleNodes;

  const selected = new Set(selectedSubclusters.map((ref) => subclusterKey(ref.cluster, ref.subcluster)));
  const selectedMembers = new Set<number>();
  const anySubclusterMembers = new Set<number>();
  spec.clusters?.forEach((cluster, clusterIndex) => {
    cluster.subclusters?.forEach((subcluster, subclusterIndex) => {
      const isSelected = selected.has(subclusterKey(clusterIndex, subclusterIndex));
      subcluster.members.forEach((member) => {
        anySubclusterMembers.add(member);
        if (isSelected) selectedMembers.add(member);
      });
    });
  });

  return new Set(
    [...visibleNodes].filter((nodeIndex) => selectedMembers.has(nodeIndex) || !anySubclusterMembers.has(nodeIndex)),
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
  const slice = options.sliceIndex;

  // スライス指定があるときは、そのスライスに現れない対象を最初から外す（`undefined` を 0 と
  // みなして比較すると、最小値 0 の絞り込みで不在の語が描かれる）。
  const frequencyOf = (nodeIndex: number): number | undefined =>
    slice === undefined
      ? file.spec.nodes[nodeIndex].frequency
      : readCooccurrenceSliceValue(file.spec, { target: 'nodes', slice, index: nodeIndex });
  const strengthOf = (linkIndex: number): number | undefined =>
    slice === undefined
      ? readLink(file.spec.links[linkIndex]).strength
      : readCooccurrenceSliceValue(file.spec, { target: 'links', slice, index: linkIndex });

  let visibleNodes = new Set<number>();
  file.spec.nodes.forEach((_node, nodeIndex) => {
    const frequency = frequencyOf(nodeIndex);
    if (frequency !== undefined && frequency >= minFrequency) visibleNodes.add(nodeIndex);
  });

  visibleNodes = applyClusterFilter(file.spec, visibleNodes, options.selectedClusterIndexes);
  visibleNodes = applySubclusterFilter(file.spec, visibleNodes, options.selectedSubclusters);

  let survivingLinks = file.spec.links
    .map((link, linkIndex) => ({ link: readLink(link), linkIndex, strength: strengthOf(linkIndex) }))
    .filter(({ link }) => visibleNodes.has(link.source) && visibleNodes.has(link.target))
    .filter(({ strength }) => strength !== undefined && strength >= minStrength);

  if (topLinkCount !== undefined) {
    survivingLinks = [...survivingLinks]
      .sort((a, b) => {
        const strengthOrder = (b.strength ?? 0) - (a.strength ?? 0);
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
