import {
  LINK_DIRECTION,
  readLink,
  schemaVersionForSpec,
  validateCooccurrenceFile,
  withDerivedTotals,
  writeLink,
  type CooccurrenceFile,
  type LinkDirection,
  type ValidationError,
} from './cooccurrenceFile';
import {
  appendCooccurrenceSlice,
  cloneCooccurrenceTimeline,
  cooccurrenceSliceCount,
  dropCooccurrenceSlice,
  hasCooccurrenceTimeline,
  remapCooccurrenceTimeline,
  renamedCooccurrenceSlice,
  reorderCooccurrenceSlice,
  roundCooccurrenceTotal,
  withCooccurrenceSliceValue,
  withoutCooccurrenceSliceValue,
  type CooccurrenceSlice,
  type CooccurrenceSliceEntry,
  type CooccurrenceSliceTarget,
} from './cooccurrenceTimeline';
import {
  cloneCooccurrenceNotes,
  remapCooccurrenceNotes,
  withCooccurrenceNote,
  withoutCooccurrenceNote,
  type CooccurrenceNoteTarget,
} from './cooccurrenceNotes';

export type CooccurrenceEditResult =
  | { ok: true; file: CooccurrenceFile }
  | { ok: false; errors: ValidationError[] };

function operationError(path: string, message: string): ValidationError {
  return { code: 'invalid-schema', path, message };
}

function cloneSpec(spec: CooccurrenceFile['spec']): CooccurrenceFile['spec'] {
  const timeline = cloneCooccurrenceTimeline(spec.timeline);
  return {
    ...(spec.title === undefined ? {} : { title: spec.title }),
    ...(spec.subject === undefined ? {} : { subject: spec.subject }),
    nodes: spec.nodes.map((node) => ({ ...node })),
    // writeLink を通すのは、複製で向きが落ちないようにするため。添字で組み直すと、
    // 語の改名やクラスタ割当のような無関係な編集を 1 回挟むだけで向きが消える。
    links: spec.links.map((link) => writeLink(readLink(link))),
    ...(spec.clusters === undefined
      ? {}
      : { clusters: spec.clusters.map((cluster) => ({ label: cluster.label, members: [...cluster.members] })) }),
    ...(cloneCooccurrenceNotes(spec.notes) === undefined ? {} : { notes: cloneCooccurrenceNotes(spec.notes) }),
    ...(timeline === undefined ? {} : { timeline }),
  };
}

function cloneFile(file: CooccurrenceFile): CooccurrenceFile {
  return {
    meta: { ...file.meta },
    spec: cloneSpec(file.spec),
    ...(file.layout === undefined
      ? {}
      : {
          layout: {
            specHash: file.layout.specHash,
            algorithmVersion: file.layout.algorithmVersion,
            positions: file.layout.positions.map((position) => [position[0], position[1]]),
          },
        }),
  };
}

function validateCandidate(file: CooccurrenceFile): CooccurrenceEditResult {
  // 版数は共起の内容から導出する。編集で向きが増減したとき版数だけが取り残されると、検証が
  // 「版数と内容が一致しない」で落ち、正当な編集そのものが失敗する（設計書 §2.2・§2.6）。
  const candidate: CooccurrenceFile = {
    ...file,
    meta: { ...file.meta, schemaVersion: schemaVersionForSpec(file.spec) },
  };
  const errors = validateCooccurrenceFile(candidate);
  return errors.length === 0 ? { ok: true, file: candidate } : { ok: false, errors };
}

function reject(path: string, message: string): CooccurrenceEditResult {
  return { ok: false, errors: [operationError(path, message)] };
}

function isNodeIndex(file: CooccurrenceFile, nodeIndex: number): boolean {
  return Number.isInteger(nodeIndex) && nodeIndex >= 0 && nodeIndex < file.spec.nodes.length;
}

function isLinkIndex(file: CooccurrenceFile, linkIndex: number): boolean {
  return Number.isInteger(linkIndex) && linkIndex >= 0 && linkIndex < file.spec.links.length;
}

function isSliceIndex(file: CooccurrenceFile, sliceIndex: number): boolean {
  return Number.isInteger(sliceIndex) && sliceIndex >= 0 && sliceIndex < cooccurrenceSliceCount(file.spec);
}

/** `next.spec.timeline` を置き換える。スライスが無くなったら `timeline` ごと落とす。 */
function setTimeline(next: CooccurrenceFile, timeline: CooccurrenceFile['spec']['timeline']): void {
  if (timeline === undefined) {
    delete next.spec.timeline;
  } else {
    next.spec.timeline = timeline;
  }
}

/**
 * 全体値をスライス値の合計へ引き直す（設計書 §2.2）。
 *
 * 時間軸に触る操作はすべてこれを通す。通し忘れると、検証（`total-not-derived`）で落ちるのは
 * 次の保存時であり、どの操作が取り残したのかが分からなくなる。
 */
function applyDerivedTotals(next: CooccurrenceFile): void {
  next.spec = withDerivedTotals(next.spec);
}

/** 語・共起へ渡されたスライス別の値を、そのスライスのエントリとして書き込む。 */
function writeSliceValues(
  next: CooccurrenceFile,
  target: CooccurrenceSliceTarget,
  index: number,
  sliceValues: ReadonlyArray<number | undefined>,
): void {
  sliceValues.forEach((value, slice) => {
    if (value === undefined) return;
    const timeline = next.spec.timeline;
    if (timeline === undefined) return;
    next.spec.timeline = withCooccurrenceSliceValue(timeline, { target, slice, index }, value);
  });
}

/**
 * スライス別の値の指定を検査する。時間軸の有無で必須・禁止が入れ替わる。
 *
 * Why not 片方だけ検査するか: 時間軸を持つファイルへ全体値だけを渡す呼び出しを黙って受けると、
 * 全体値は合計（＝0）へ導出され、呼び出し側が与えた値が失われる（設計書 §2.2）。
 */
function checkSliceValues(
  file: CooccurrenceFile,
  sliceValues: ReadonlyArray<number | undefined> | undefined,
  path: string,
): CooccurrenceEditResult | undefined {
  const sliceCount = cooccurrenceSliceCount(file.spec);
  if (sliceCount === 0) {
    return sliceValues === undefined
      ? undefined
      : { ok: false, errors: [{ code: 'invalid-schema', path, message: 'file has no timeline to hold slice values' }] };
  }
  if (sliceValues === undefined) {
    return { ok: false, errors: [{ code: 'slice-values-required', path, message: 'file has a timeline; slice values are required' }] };
  }
  if (sliceValues.length !== sliceCount) {
    return {
      ok: false,
      errors: [{ code: 'slice-count-mismatch', path, message: `slice values length must match slices length (${sliceCount})` }],
    };
  }
  return undefined;
}

/** 時間軸を持つファイルで全体値を直接与えようとした呼び出しを弾く。 */
function checkTotalAgainstSlices(
  total: number,
  sliceValues: ReadonlyArray<number | undefined>,
  path: string,
): CooccurrenceEditResult | undefined {
  if (total === 0) return undefined;
  const sum = roundCooccurrenceTotal(
    sliceValues.reduce<number>((accumulated, value) => accumulated + (value ?? 0), 0),
  );
  if (roundCooccurrenceTotal(total) === sum) return undefined;
  return {
    ok: false,
    errors: [
      {
        code: 'total-not-editable',
        path,
        message: `total is derived from slice values (${sum}); pass 0 or the matching sum`,
      },
    ],
  };
}

/** 語の追加の入力。時間軸の有無で `frequency` と `sliceValues` の必須が入れ替わる。 */
export interface CooccurrenceNodeInput {
  label: string;
  /** 時間軸を持たないファイルで使う全体値。 */
  frequency?: number;
  /** 時間軸を持つファイルで使うスライス別の値。スライスと同じ順序・同じ長さ。不在は undefined。 */
  sliceValues?: ReadonlyArray<number | undefined>;
}

export function addCooccurrenceNode(
  file: CooccurrenceFile,
  node: CooccurrenceNodeInput,
  position?: [number, number],
): CooccurrenceEditResult {
  const rejected = checkSliceValues(file, node.sliceValues, 'spec.timeline.nodes');
  if (rejected !== undefined) return rejected;
  const frequency = node.frequency ?? 0;
  if (node.sliceValues !== undefined) {
    const conflict = checkTotalAgainstSlices(frequency, node.sliceValues, 'spec.nodes.frequency');
    if (conflict !== undefined) return conflict;
  }

  const next = cloneFile(file);
  const nodeIndex = next.spec.nodes.length;
  next.spec.nodes.push({ label: node.label, frequency });
  if (next.layout !== undefined) {
    next.layout.positions.push(position === undefined ? [0, 0] : [position[0], position[1]]);
  }
  if (node.sliceValues !== undefined) {
    writeSliceValues(next, 'nodes', nodeIndex, node.sliceValues);
    applyDerivedTotals(next);
  }
  return validateCandidate(next);
}

export function deleteCooccurrenceNode(file: CooccurrenceFile, nodeIndex: number): CooccurrenceEditResult {
  if (!isNodeIndex(file, nodeIndex)) return reject('spec.nodes', 'node index is outside nodes');

  const next = cloneFile(file);
  const remap = (index: number): number | undefined => {
    if (index === nodeIndex) return undefined;
    return index > nodeIndex ? index - 1 : index;
  };

  next.spec.nodes = next.spec.nodes.filter((_, index) => index !== nodeIndex);
  next.spec.links = next.spec.links.flatMap((link) => {
    const view = readLink(link);
    const source = remap(view.source);
    const target = remap(view.target);
    return source === undefined || target === undefined ? [] : [writeLink({ ...view, source, target })];
  });

  if (next.spec.subject !== undefined) {
    const subject = remap(next.spec.subject);
    if (subject === undefined) {
      delete next.spec.subject;
    } else {
      next.spec.subject = subject;
    }
  }

  if (next.spec.clusters !== undefined) {
    next.spec.clusters = next.spec.clusters.map((cluster) => ({
      label: cluster.label,
      members: cluster.members.flatMap((member) => {
        const mapped = remap(member);
        return mapped === undefined ? [] : [mapped];
      }),
    }));
  }

  if (next.layout !== undefined) {
    next.layout.positions = next.layout.positions.filter((_, index) => index !== nodeIndex);
  }

  // 語のメモは語と同じ規則で繰り上がる。共起のメモは「道連れで消えた共起」の分だけ詰まるため、
  // 削除前の共起の並びから残存判定を作って付け替える（添字の対応を語側の remap から導けない）。
  setNotes(next, 'nodes', remap);
  const keptLinkIndexes: number[] = [];
  file.spec.links.forEach((link, index) => {
    const view = readLink(link);
    if (remap(view.source) !== undefined && remap(view.target) !== undefined) keptLinkIndexes.push(index);
  });
  const remapLink = (index: number): number | undefined => {
    const position = keptLinkIndexes.indexOf(index);
    return position === -1 ? undefined : position;
  };
  setNotes(next, 'links', remapLink);

  // スライスの添字もメモと同じ規則で付け替える。共起側は「道連れで消えた共起」の分だけ詰まるため、
  // 削除前の共起の並びから作った残存判定（keptLinkIndexes）を使う。
  setTimelineRemap(next, 'nodes', remap);
  setTimelineRemap(next, 'links', remapLink);
  applyDerivedTotals(next);

  return validateCandidate(next);
}

/** `next.spec.timeline` を付け替えた結果で置き換える。 */
function setTimelineRemap(
  next: CooccurrenceFile,
  target: CooccurrenceSliceTarget,
  remap: (index: number) => number | undefined,
): void {
  setTimeline(next, remapCooccurrenceTimeline(next.spec.timeline, target, remap));
}

/** `next.spec.notes` を付け替えた結果で置き換える。空になったら `notes` ごと落とす。 */
function setNotes(
  next: CooccurrenceFile,
  target: CooccurrenceNoteTarget,
  remap: (index: number) => number | undefined,
): void {
  const notes = remapCooccurrenceNotes(next.spec.notes, target, remap);
  if (notes === undefined) {
    delete next.spec.notes;
  } else {
    next.spec.notes = notes;
  }
}

export function renameCooccurrenceNode(
  file: CooccurrenceFile,
  nodeIndex: number,
  label: string,
): CooccurrenceEditResult {
  if (!isNodeIndex(file, nodeIndex)) return reject(`spec.nodes.${nodeIndex}`, 'node index is outside nodes');
  const next = cloneFile(file);
  next.spec.nodes[nodeIndex] = { ...next.spec.nodes[nodeIndex], label };
  return validateCandidate(next);
}

export function setCooccurrenceNodeFrequency(
  file: CooccurrenceFile,
  nodeIndex: number,
  frequency: number,
): CooccurrenceEditResult {
  if (!isNodeIndex(file, nodeIndex)) return reject(`spec.nodes.${nodeIndex}`, 'node index is outside nodes');
  // 時間軸を持つファイルの全体値は合計から導出される（設計書 §2.2）。ここで受け付けると、次の
  // 導出で黙って上書きされるか、導出を通さないまま検証に落ちるファイルができる。
  if (hasCooccurrenceTimeline(file.spec)) {
    return {
      ok: false,
      errors: [
        {
          code: 'total-not-editable',
          path: `spec.nodes.${nodeIndex}.frequency`,
          message: 'frequency is derived from slice values; edit the slice values instead',
        },
      ],
    };
  }
  const next = cloneFile(file);
  next.spec.nodes[nodeIndex] = { ...next.spec.nodes[nodeIndex], frequency };
  return validateCandidate(next);
}

export function assignCooccurrenceNodeToCluster(
  file: CooccurrenceFile,
  nodeIndex: number,
  clusterIndex: number,
): CooccurrenceEditResult {
  return setCooccurrenceNodeCluster(file, nodeIndex, clusterIndex);
}

export function setCooccurrenceNodeCluster(
  file: CooccurrenceFile,
  nodeIndex: number,
  clusterIndex: number | undefined,
): CooccurrenceEditResult {
  if (!isNodeIndex(file, nodeIndex)) return reject(`spec.nodes.${nodeIndex}`, 'node index is outside nodes');
  if (clusterIndex !== undefined && (!Number.isInteger(clusterIndex) || clusterIndex < 0)) {
    return reject('spec.clusters', 'cluster index must be a non-negative integer');
  }

  const next = cloneFile(file);
  const clusters = next.spec.clusters ?? [];
  if (clusterIndex !== undefined && clusterIndex >= clusters.length) {
    return reject(`spec.clusters.${clusterIndex}`, 'cluster index is outside clusters');
  }
  next.spec.clusters = clusters.map((cluster, index) => {
    const withoutNode = cluster.members.filter((member) => member !== nodeIndex);
    if (index !== clusterIndex) return { label: cluster.label, members: withoutNode };
    return { label: cluster.label, members: [...withoutNode, nodeIndex] };
  });
  return validateCandidate(next);
}

export function addCooccurrenceLink(
  file: CooccurrenceFile,
  link: CooccurrenceFile['spec']['links'][number],
  sliceValues?: ReadonlyArray<number | undefined>,
): CooccurrenceEditResult {
  const rejected = checkSliceValues(file, sliceValues, 'spec.timeline.links');
  if (rejected !== undefined) return rejected;
  const view = readLink(link);
  if (sliceValues !== undefined) {
    const conflict = checkTotalAgainstSlices(view.strength, sliceValues, 'spec.links.2');
    if (conflict !== undefined) return conflict;
  }

  const next = cloneFile(file);
  const linkIndex = next.spec.links.length;
  next.spec.links.push(writeLink(view));
  if (sliceValues !== undefined) {
    writeSliceValues(next, 'links', linkIndex, sliceValues);
    applyDerivedTotals(next);
  }
  return validateCandidate(next);
}

export function deleteCooccurrenceLink(file: CooccurrenceFile, linkIndex: number): CooccurrenceEditResult {
  if (!isLinkIndex(file, linkIndex)) return reject(`spec.links.${linkIndex}`, 'link index is outside links');
  const next = cloneFile(file);
  next.spec.links = next.spec.links.filter((_, index) => index !== linkIndex);
  const remap = (index: number): number | undefined => {
    if (index === linkIndex) return undefined;
    return index > linkIndex ? index - 1 : index;
  };
  setNotes(next, 'links', remap);
  setTimelineRemap(next, 'links', remap);
  applyDerivedTotals(next);
  return validateCandidate(next);
}

export function setCooccurrenceLinkStrength(
  file: CooccurrenceFile,
  linkIndex: number,
  strength: number,
): CooccurrenceEditResult {
  if (!isLinkIndex(file, linkIndex)) return reject(`spec.links.${linkIndex}`, 'link index is outside links');
  if (hasCooccurrenceTimeline(file.spec)) {
    return {
      ok: false,
      errors: [
        {
          code: 'total-not-editable',
          path: `spec.links.${linkIndex}.2`,
          message: 'strength is derived from slice values; edit the slice values instead',
        },
      ],
    };
  }
  const next = cloneFile(file);
  const view = readLink(next.spec.links[linkIndex]);
  next.spec.links[linkIndex] = writeLink({ ...view, strength });
  return validateCandidate(next);
}

/**
 * 共起の向きを変える。
 *
 * Why not 強度と同じ関数で両方を受けるか: 片方だけ変えたい呼び出し側がもう一方の現在値を読んで
 * 渡す必要が生じ、読み落とすと黙って既定値へ戻る。
 */
export function setCooccurrenceLinkDirection(
  file: CooccurrenceFile,
  linkIndex: number,
  direction: LinkDirection,
): CooccurrenceEditResult {
  if (!isLinkIndex(file, linkIndex)) return reject(`spec.links.${linkIndex}`, 'link index is outside links');
  if (!Number.isInteger(direction) || direction < LINK_DIRECTION.none || direction > LINK_DIRECTION.both) {
    return reject(`spec.links.${linkIndex}.3`, 'link direction must be an integer in 0..3');
  }
  const next = cloneFile(file);
  const view = readLink(next.spec.links[linkIndex]);
  next.spec.links[linkIndex] = writeLink({ ...view, direction });
  return validateCandidate(next);
}

export function setCooccurrenceTitle(file: CooccurrenceFile, title: string | undefined): CooccurrenceEditResult {
  const next = cloneFile(file);
  if (title === undefined) {
    delete next.spec.title;
  } else {
    next.spec.title = title;
  }
  return validateCandidate(next);
}

export function setCooccurrenceSubject(file: CooccurrenceFile, subject: number | undefined): CooccurrenceEditResult {
  const next = cloneFile(file);
  if (subject === undefined) {
    delete next.spec.subject;
  } else {
    next.spec.subject = subject;
  }
  return validateCandidate(next);
}

/**
 * メモを設定する。
 *
 * Why not 空文字で削除を兼ねるか: 空文字は §2.6 で不正であり、兼ねると「削除したつもりが
 * 入力エラーになる」か「不正な値を書き込む」のどちらかになる。削除は削除として持つ。
 */
function setNote(
  file: CooccurrenceFile,
  target: CooccurrenceNoteTarget,
  index: number,
  text: string,
): CooccurrenceEditResult {
  if (!isNoteTargetIndex(file, target, index)) {
    return reject(`spec.notes.${target}`, `note target is outside ${target}`);
  }
  const next = cloneFile(file);
  next.spec.notes = withCooccurrenceNote(next.spec.notes, target, index, text);
  return validateCandidate(next);
}

function removeNote(file: CooccurrenceFile, target: CooccurrenceNoteTarget, index: number): CooccurrenceEditResult {
  if (!isNoteTargetIndex(file, target, index)) {
    return reject(`spec.notes.${target}`, `note target is outside ${target}`);
  }
  const next = cloneFile(file);
  const notes = withoutCooccurrenceNote(next.spec.notes, target, index);
  if (notes === undefined) {
    delete next.spec.notes;
  } else {
    next.spec.notes = notes;
  }
  return validateCandidate(next);
}

function isNoteTargetIndex(file: CooccurrenceFile, target: CooccurrenceNoteTarget, index: number): boolean {
  const counts: Record<CooccurrenceNoteTarget, number> = {
    nodes: file.spec.nodes.length,
    links: file.spec.links.length,
    clusters: file.spec.clusters?.length ?? 0,
  };
  return Number.isInteger(index) && index >= 0 && index < counts[target];
}

export function setCooccurrenceNodeNote(file: CooccurrenceFile, nodeIndex: number, text: string): CooccurrenceEditResult {
  return setNote(file, 'nodes', nodeIndex, text);
}

export function removeCooccurrenceNodeNote(file: CooccurrenceFile, nodeIndex: number): CooccurrenceEditResult {
  return removeNote(file, 'nodes', nodeIndex);
}

export function setCooccurrenceLinkNote(file: CooccurrenceFile, linkIndex: number, text: string): CooccurrenceEditResult {
  return setNote(file, 'links', linkIndex, text);
}

export function removeCooccurrenceLinkNote(file: CooccurrenceFile, linkIndex: number): CooccurrenceEditResult {
  return removeNote(file, 'links', linkIndex);
}

export function setCooccurrenceClusterNote(
  file: CooccurrenceFile,
  clusterIndex: number,
  text: string,
): CooccurrenceEditResult {
  return setNote(file, 'clusters', clusterIndex, text);
}

export function removeCooccurrenceClusterNote(file: CooccurrenceFile, clusterIndex: number): CooccurrenceEditResult {
  return removeNote(file, 'clusters', clusterIndex);
}

/** 語のスライス別の値を指す。 */
export interface CooccurrenceNodeSliceRef {
  node: number;
  slice: number;
}

/** 共起のスライス別の値を指す。 */
export interface CooccurrenceLinkSliceRef {
  link: number;
  slice: number;
}

/**
 * 最初のスライスへ引き継ぐエントリ。現在の全体値をそのまま入れる。
 *
 * 時間軸を持たないファイルは「全期間が 1 つのスライスである」状態と等価であり、最初のスライスは
 * その全期間そのものである。引き継がないと、時間軸を足した瞬間に全ての全体値が合計 0 へ潰れ、
 * 書き手が入力した頻度と強度が黙って失われる（設計書 §2.2）。
 */
function seedFromTotals(spec: CooccurrenceFile['spec']): {
  nodes: CooccurrenceSliceEntry[];
  links: CooccurrenceSliceEntry[];
} {
  return {
    // 値が 0 の対象はエントリにしない（不在はエントリが現れないことで表す。設計書 §2.2）。
    nodes: spec.nodes.flatMap((node, index) =>
      node.frequency > 0 ? [[index, node.frequency] as CooccurrenceSliceEntry] : [],
    ),
    links: spec.links.flatMap((link, index) => {
      const strength = readLink(link).strength;
      return strength > 0 ? [[index, strength] as CooccurrenceSliceEntry] : [];
    }),
  };
}

/** スライスを末尾へ足す。最初の 1 枚は現在の全体値を引き継ぐ。 */
export function addCooccurrenceSlice(file: CooccurrenceFile, slice: CooccurrenceSlice): CooccurrenceEditResult {
  const next = cloneFile(file);
  const seeded = hasCooccurrenceTimeline(next.spec) ? { nodes: [], links: [] } : seedFromTotals(next.spec);
  next.spec.timeline = appendCooccurrenceSlice(next.spec.timeline, slice, seeded);
  applyDerivedTotals(next);
  return validateCandidate(next);
}

/** スライスを 1 枚落とす。最後の 1 枚を落とすと時間軸そのものが消え、全体値はその時点の値で残る。 */
export function deleteCooccurrenceSlice(file: CooccurrenceFile, sliceIndex: number): CooccurrenceEditResult {
  const timeline = file.spec.timeline;
  if (timeline === undefined || !isSliceIndex(file, sliceIndex)) {
    return reject('spec.timeline.slices', 'slice index is outside slices');
  }
  const next = cloneFile(file);
  setTimeline(next, dropCooccurrenceSlice(timeline, sliceIndex));
  applyDerivedTotals(next);
  return validateCandidate(next);
}

/** スライスのラベルと日付を差し替える。値は動かさない。 */
export function renameCooccurrenceSlice(
  file: CooccurrenceFile,
  sliceIndex: number,
  slice: CooccurrenceSlice,
): CooccurrenceEditResult {
  const timeline = file.spec.timeline;
  if (timeline === undefined || !isSliceIndex(file, sliceIndex)) {
    return reject('spec.timeline.slices', 'slice index is outside slices');
  }
  const next = cloneFile(file);
  next.spec.timeline = renamedCooccurrenceSlice(timeline, sliceIndex, slice);
  return validateCandidate(next);
}

/** スライスを並べ替える。スライスと値を同時に動かす。 */
export function moveCooccurrenceSlice(
  file: CooccurrenceFile,
  from: number,
  to: number,
): CooccurrenceEditResult {
  const timeline = file.spec.timeline;
  if (timeline === undefined || !isSliceIndex(file, from) || !isSliceIndex(file, to)) {
    return reject('spec.timeline.slices', 'slice index is outside slices');
  }
  const next = cloneFile(file);
  next.spec.timeline = reorderCooccurrenceSlice(timeline, from, to);
  return validateCandidate(next);
}

function setSliceValue(
  file: CooccurrenceFile,
  ref: { target: CooccurrenceSliceTarget; slice: number; index: number },
  value: number,
): CooccurrenceEditResult {
  const timeline = file.spec.timeline;
  if (timeline === undefined || !isSliceIndex(file, ref.slice)) {
    return reject('spec.timeline.slices', 'slice index is outside slices');
  }
  const withinTarget = ref.target === 'nodes' ? isNodeIndex(file, ref.index) : isLinkIndex(file, ref.index);
  if (!withinTarget) return reject(`spec.${ref.target}.${ref.index}`, `index is outside ${ref.target}`);
  // 不在は「エントリを消すこと」で表す（設計書 §2.2）。0 を書けるようにすると同じ状態に 2 通りの
  // 表現ができ、合計の導出と往復一致が揺れる。
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'non-positive-slice-value',
          path: `spec.timeline.${ref.target}.${ref.slice}`,
          message: 'slice value must be positive; remove the value to mark it absent',
        },
      ],
    };
  }

  const next = cloneFile(file);
  next.spec.timeline = withCooccurrenceSliceValue(timeline, ref, value);
  applyDerivedTotals(next);
  return validateCandidate(next);
}

function removeSliceValue(
  file: CooccurrenceFile,
  ref: { target: CooccurrenceSliceTarget; slice: number; index: number },
): CooccurrenceEditResult {
  const timeline = file.spec.timeline;
  if (timeline === undefined || !isSliceIndex(file, ref.slice)) {
    return reject('spec.timeline.slices', 'slice index is outside slices');
  }
  const next = cloneFile(file);
  next.spec.timeline = withoutCooccurrenceSliceValue(timeline, ref);
  applyDerivedTotals(next);
  return validateCandidate(next);
}

export function setCooccurrenceNodeSliceValue(
  file: CooccurrenceFile,
  at: CooccurrenceNodeSliceRef,
  value: number,
): CooccurrenceEditResult {
  return setSliceValue(file, { target: 'nodes', slice: at.slice, index: at.node }, value);
}

export function removeCooccurrenceNodeSliceValue(
  file: CooccurrenceFile,
  at: CooccurrenceNodeSliceRef,
): CooccurrenceEditResult {
  return removeSliceValue(file, { target: 'nodes', slice: at.slice, index: at.node });
}

export function setCooccurrenceLinkSliceValue(
  file: CooccurrenceFile,
  at: CooccurrenceLinkSliceRef,
  value: number,
): CooccurrenceEditResult {
  return setSliceValue(file, { target: 'links', slice: at.slice, index: at.link }, value);
}

export function removeCooccurrenceLinkSliceValue(
  file: CooccurrenceFile,
  at: CooccurrenceLinkSliceRef,
): CooccurrenceEditResult {
  return removeSliceValue(file, { target: 'links', slice: at.slice, index: at.link });
}
