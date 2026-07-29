import {
  LINK_DIRECTION,
  readLink,
  schemaVersionForSpec,
  validateCooccurrenceFile,
  writeLink,
  type CooccurrenceFile,
  type LinkDirection,
  type ValidationError,
} from './cooccurrenceFile';
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

export function addCooccurrenceNode(
  file: CooccurrenceFile,
  node: CooccurrenceFile['spec']['nodes'][number],
  position?: [number, number],
): CooccurrenceEditResult {
  const next = cloneFile(file);
  next.spec.nodes.push({ label: node.label, frequency: node.frequency });
  if (next.layout !== undefined) {
    next.layout.positions.push(position === undefined ? [0, 0] : [position[0], position[1]]);
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
  setNotes(next, 'links', (index) => {
    const position = keptLinkIndexes.indexOf(index);
    return position === -1 ? undefined : position;
  });

  return validateCandidate(next);
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
): CooccurrenceEditResult {
  const next = cloneFile(file);
  next.spec.links.push(writeLink(readLink(link)));
  return validateCandidate(next);
}

export function deleteCooccurrenceLink(file: CooccurrenceFile, linkIndex: number): CooccurrenceEditResult {
  if (!isLinkIndex(file, linkIndex)) return reject(`spec.links.${linkIndex}`, 'link index is outside links');
  const next = cloneFile(file);
  next.spec.links = next.spec.links.filter((_, index) => index !== linkIndex);
  setNotes(next, 'links', (index) => {
    if (index === linkIndex) return undefined;
    return index > linkIndex ? index - 1 : index;
  });
  return validateCandidate(next);
}

export function setCooccurrenceLinkStrength(
  file: CooccurrenceFile,
  linkIndex: number,
  strength: number,
): CooccurrenceEditResult {
  if (!isLinkIndex(file, linkIndex)) return reject(`spec.links.${linkIndex}`, 'link index is outside links');
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
