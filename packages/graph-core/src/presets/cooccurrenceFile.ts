import { sha256Hex } from './sha256';
import {
  COOCCURRENCE_NOTE_MAX_LENGTH,
  COOCCURRENCE_NOTE_TARGETS,
  cloneCooccurrenceNotes,
  hasAnyCooccurrenceNote,
  type CooccurrenceNotes,
  type CooccurrenceNoteTarget,
} from './cooccurrenceNotes';
import {
  COOCCURRENCE_SLICE_ENTRY_MAX,
  COOCCURRENCE_SLICE_MAX,
  COOCCURRENCE_SLICE_TARGETS,
  cloneCooccurrenceTimeline,
  cooccurrenceSliceDateValue,
  cooccurrenceSliceEntryCount,
  hasCooccurrenceTimeline,
  roundCooccurrenceTotal,
  totalCooccurrenceSliceValue,
  type CooccurrenceSliceTarget,
  type CooccurrenceTimeline,
} from './cooccurrenceTimeline';

/** 共起の向き。0=無向・1=順方向（a→b）・2=逆方向（b→a）・3=双方向。 */
export const LINK_DIRECTION = { none: 0, forward: 1, backward: 2, both: 3 } as const;

export type LinkDirection = (typeof LINK_DIRECTION)[keyof typeof LINK_DIRECTION];

/** 共起のタプル。向きが無向のときは第 4 要素を書かない（設計書 §2.2）。 */
export type CooccurrenceLinkTuple =
  | [source: number, target: number, strength: number]
  | [source: number, target: number, strength: number, direction: LinkDirection];

/** タプルを展開した形。消費側はこの形だけを見る。 */
export interface CooccurrenceLinkView {
  source: number;
  target: number;
  strength: number;
  direction: LinkDirection;
}

/**
 * タプルを展開する。第 4 要素が無いときは無向を補う。
 *
 * Why not 消費側で `link[3] ?? 0` と書くか: 既定値の補完が呼び出し箇所ごとに散り、書き漏らしが
 * 「向きが黙って消える」形でしか現れない（設計書 §2.2）。
 */
export function readLink(link: CooccurrenceLinkTuple): CooccurrenceLinkView {
  return { source: link[0], target: link[1], strength: link[2], direction: link[3] ?? LINK_DIRECTION.none };
}

/**
 * タプルへ畳む。無向なら 3 要素で返す。
 *
 * `schemaVersion` を 1 に保つ条件（4 要素が 1 本も無いこと）をここへ集約する。実装へ散らすと、
 * 向きを使っていないファイルが版数 2 で書かれ、旧実装との往復が黙って切れる。
 */
export function writeLink(view: CooccurrenceLinkView): CooccurrenceLinkTuple {
  return view.direction === LINK_DIRECTION.none
    ? [view.source, view.target, view.strength]
    : [view.source, view.target, view.strength, view.direction];
}

function hasDirectedLink(links: readonly CooccurrenceLinkTuple[]): boolean {
  return links.some((link) => link.length === 4 && link[3] !== LINK_DIRECTION.none);
}

/**
 * spec の内容から版数を導出する。時間軸を持てば 4、メモを 1 件でも持てば 3、向きを 1 本でも
 * 持てば 2、いずれも無ければ 1（設計書 §2.2）。
 *
 * Why not 版数を書き出し時にだけ決めるか: 編集の途中で版数だけが内容から取り残され、検証が
 * 「版数と内容が一致しない」（設計書 §2.6）で落ちる。版数は内容の説明であり、内容を変えたら
 * 同時に決まる。導出をここへ集約し、編集経路と書き出し経路で規則が分かれないようにする。
 *
 * Why not 共起（links）だけを見る関数のままにするか: メモは links の外にあるため、links だけを
 * 見る関数を残すと、メモを持つファイルが版数 2 以下で書かれ、自作のファイルが自作の検証に落ちる。
 */
export function schemaVersionForSpec(spec: CooccurrenceFile['spec']): 1 | 2 | 3 | 4 {
  if (hasCooccurrenceTimeline(spec)) return 4;
  if (hasAnyCooccurrenceNote(spec)) return 3;
  return hasDirectedLink(spec.links) ? 2 : 1;
}

export interface CooccurrenceFile {
  meta: {
    /**
     * スキーマの版数。互換性のない変更で繰り上げる。向き付きの共起を含むとき 2、
     * メモを含むとき 3、時間軸を含むとき 4（設計書 §2.2）。
     */
    schemaVersion: 1 | 2 | 3 | 4;
    /** 生成日時（ISO 8601・UTC）。 */
    generatedAt: string;
    /** 生成元。 */
    origin: 'manual' | 'mcp';
  };
  spec: {
    title?: string;
    /** 中心事象。nodes の添字で指す。 */
    subject?: number;
    /** 語。配列の順序が語の同一性を決める（添字が識別子）。 */
    nodes: Array<{ label: string; frequency: number }>;
    /** 共起。[語の添字, 語の添字, 強度] または [語の添字, 語の添字, 強度, 向き]。 */
    links: CooccurrenceLinkTuple[];
    /** クラスタ。members は nodes の添字。 */
    clusters?: Array<{ label: string; members: number[] }>;
    /** メモ。添字は同名の配列を指す。1 件も持たないときは書かない（設計書 §2.2）。 */
    notes?: CooccurrenceNotes;
    /** 時間軸。スライスを 1 つも持たないときは書かない（設計書 §2.2・§3.6）。 */
    timeline?: CooccurrenceTimeline;
  };
  /** 座標キャッシュ。無くてよい。 */
  layout?: {
    /** nodes と同じ順序・同じ長さの [x, y]。 */
    positions: Array<[number, number]>;
    /** 算出時の spec の正規化ハッシュ。 */
    specHash: string;
    /** 算出したレイアウトアルゴリズムの版数。 */
    algorithmVersion: string;
  };
}

export type ValidationErrorCode =
  | 'invalid-schema'
  | 'duplicate-node-label'
  | 'self-cooccurrence'
  | 'negative-frequency'
  | 'negative-link-strength'
  | 'link-endpoint-out-of-range'
  | 'node-reference-out-of-range'
  | 'layout-position-count-mismatch'
  | 'note-target-out-of-range'
  | 'duplicate-note-target'
  | 'empty-note'
  | 'note-too-long'
  | 'slice-count-mismatch'
  | 'empty-slice-label'
  | 'duplicate-slice-label'
  | 'invalid-slice-date'
  | 'slice-order-not-chronological'
  | 'slice-target-out-of-range'
  | 'duplicate-slice-target'
  | 'non-positive-slice-value'
  | 'too-many-slices'
  | 'too-many-slice-entries'
  | 'total-not-derived'
  | 'total-not-editable'
  | 'slice-values-required';

export interface ValidationError {
  code: ValidationErrorCode;
  path: string;
  message: string;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function prop(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function error(code: ValidationErrorCode, path: string, message: string): ValidationError {
  return { code, path, message };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIndex(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

function nodeCountOfSpec(spec: unknown): number | undefined {
  if (!isRecord(spec)) return undefined;
  const nodes = prop(spec, 'nodes');
  return Array.isArray(nodes) ? nodes.length : undefined;
}

function validateTimelineStructure(timeline: Record<string, unknown>, schemaVersion: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  const slices = prop(timeline, 'slices');
  if (!Array.isArray(slices)) {
    errors.push(error('invalid-schema', 'spec.timeline.slices', 'slices must be an array'));
  } else {
    // 版数が内容を説明していないファイルを受理しない（設計書 §2.6）。向き・メモと同じ理由で、
    // 旧実装が拒否するファイルを新実装だけが受理する状態を作らない。
    if (slices.length > 0 && schemaVersion !== 4) {
      errors.push(error('invalid-schema', 'spec.timeline', 'timeline requires schemaVersion 4'));
    }
    slices.forEach((slice, i) => {
      if (!isRecord(slice)) {
        errors.push(error('invalid-schema', `spec.timeline.slices.${i}`, 'slice must be an object'));
        return;
      }
      if (typeof prop(slice, 'label') !== 'string') {
        errors.push(error('invalid-schema', `spec.timeline.slices.${i}.label`, 'slice label must be a string'));
      }
      const at = prop(slice, 'at');
      if (at !== undefined && typeof at !== 'string') {
        errors.push(error('invalid-schema', `spec.timeline.slices.${i}.at`, 'slice at must be a string'));
      }
    });
  }

  for (const target of COOCCURRENCE_SLICE_TARGETS) {
    const perSlice = prop(timeline, target);
    if (!Array.isArray(perSlice)) {
      errors.push(error('invalid-schema', `spec.timeline.${target}`, `timeline ${target} must be an array`));
      continue;
    }
    perSlice.forEach((entries, sliceIndex) => {
      if (!Array.isArray(entries)) {
        errors.push(
          error('invalid-schema', `spec.timeline.${target}.${sliceIndex}`, 'slice entries must be an array'),
        );
        return;
      }
      entries.forEach((entry, i) => {
        const path = `spec.timeline.${target}.${sliceIndex}.${i}`;
        if (!Array.isArray(entry) || entry.length !== 2) {
          errors.push(error('invalid-schema', path, 'slice entry must be [index, value]'));
          return;
        }
        if (!Number.isInteger(entry[0])) {
          errors.push(error('invalid-schema', `${path}.0`, 'slice entry target must be an integer'));
        }
        if (!isFiniteNumber(entry[1])) {
          errors.push(error('invalid-schema', `${path}.1`, 'slice entry value must be a finite number'));
        }
      });
    });
  }

  return errors;
}

function validateStructure(file: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!isRecord(file)) {
    return [error('invalid-schema', '', 'file must be an object')];
  }

  let schemaVersion: unknown;
  const meta = prop(file, 'meta');
  if (!isRecord(meta)) {
    errors.push(error('invalid-schema', 'meta', 'meta must be an object'));
  } else {
    schemaVersion = prop(meta, 'schemaVersion');
    if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4) {
      errors.push(error('invalid-schema', 'meta.schemaVersion', 'schemaVersion must be 1, 2, 3 or 4'));
    }
    if (typeof prop(meta, 'generatedAt') !== 'string') {
      errors.push(error('invalid-schema', 'meta.generatedAt', 'generatedAt must be a string'));
    }
    const origin = prop(meta, 'origin');
    if (origin !== 'manual' && origin !== 'mcp') {
      errors.push(error('invalid-schema', 'meta.origin', 'origin must be "manual" or "mcp"'));
    }
  }

  const spec = prop(file, 'spec');
  if (!isRecord(spec)) {
    errors.push(error('invalid-schema', 'spec', 'spec must be an object'));
    return errors;
  }

  const title = prop(spec, 'title');
  if (title !== undefined && typeof title !== 'string') {
    errors.push(error('invalid-schema', 'spec.title', 'title must be a string'));
  }
  const subject = prop(spec, 'subject');
  if (subject !== undefined && !Number.isInteger(subject)) {
    errors.push(error('invalid-schema', 'spec.subject', 'subject must be an integer'));
  }

  const nodes = prop(spec, 'nodes');
  if (!Array.isArray(nodes)) {
    errors.push(error('invalid-schema', 'spec.nodes', 'nodes must be an array'));
  } else {
    nodes.forEach((node, i) => {
      if (!isRecord(node)) {
        errors.push(error('invalid-schema', `spec.nodes.${i}`, 'node must be an object'));
        return;
      }
      if (typeof prop(node, 'label') !== 'string') {
        errors.push(error('invalid-schema', `spec.nodes.${i}.label`, 'node label must be a string'));
      }
      if (!isFiniteNumber(prop(node, 'frequency'))) {
        errors.push(error('invalid-schema', `spec.nodes.${i}.frequency`, 'node frequency must be a finite number'));
      }
    });
  }

  const links = prop(spec, 'links');
  if (!Array.isArray(links)) {
    errors.push(error('invalid-schema', 'spec.links', 'links must be an array'));
  } else {
    links.forEach((link, i) => {
      if (!Array.isArray(link) || (link.length !== 3 && link.length !== 4)) {
        errors.push(
          error(
            'invalid-schema',
            `spec.links.${i}`,
            'link must be [source, target, strength] or [source, target, strength, direction]',
          ),
        );
        return;
      }
      for (let j = 0; j < 2; j++) {
        if (!Number.isInteger(link[j])) {
          errors.push(error('invalid-schema', `spec.links.${i}.${j}`, 'link endpoint must be an integer'));
        }
      }
      if (!isFiniteNumber(link[2])) {
        errors.push(error('invalid-schema', `spec.links.${i}.2`, 'link strength must be a finite number'));
      }
      if (link.length === 4) {
        // 版数が内容を説明していないファイルを受理しない（設計書 §2.6）。読めてしまうと、旧実装が
        // 拒否するファイルを新実装だけが受理する状態になり、どちらが正しいのか判断できなくなる。
        if (schemaVersion === 1) {
          errors.push(error('invalid-schema', `spec.links.${i}`, 'link with direction requires schemaVersion 2'));
        }
        if (!Number.isInteger(link[3]) || link[3] < 0 || link[3] > 3) {
          errors.push(error('invalid-schema', `spec.links.${i}.3`, 'link direction must be an integer in 0..3'));
        }
      }
    });
  }

  const clusters = prop(spec, 'clusters');
  if (clusters !== undefined) {
    if (!Array.isArray(clusters)) {
      errors.push(error('invalid-schema', 'spec.clusters', 'clusters must be an array'));
    } else {
      clusters.forEach((cluster, i) => {
        if (!isRecord(cluster)) {
          errors.push(error('invalid-schema', `spec.clusters.${i}`, 'cluster must be an object'));
          return;
        }
        if (typeof prop(cluster, 'label') !== 'string') {
          errors.push(error('invalid-schema', `spec.clusters.${i}.label`, 'cluster label must be a string'));
        }
        const members = prop(cluster, 'members');
        if (!Array.isArray(members)) {
          errors.push(error('invalid-schema', `spec.clusters.${i}.members`, 'cluster members must be an array'));
          return;
        }
        members.forEach((member, j) => {
          if (!Number.isInteger(member)) {
            errors.push(
              error('invalid-schema', `spec.clusters.${i}.members.${j}`, 'cluster member must be an integer'),
            );
          }
        });
      });
    }
  }

  const notes = prop(spec, 'notes');
  if (notes !== undefined) {
    if (!isRecord(notes)) {
      errors.push(error('invalid-schema', 'spec.notes', 'notes must be an object'));
    } else {
      // 版数が内容を説明していないファイルを受理しない（設計書 §2.6）。向きのときと同じ理由で、
      // 旧実装が拒否するファイルを新実装だけが受理する状態を作らない。
      if (schemaVersion === 1 || schemaVersion === 2) {
        errors.push(error('invalid-schema', 'spec.notes', 'notes require schemaVersion 3'));
      }
      for (const target of COOCCURRENCE_NOTE_TARGETS) {
        const entries = prop(notes, target);
        if (entries === undefined) continue;
        if (!Array.isArray(entries)) {
          errors.push(error('invalid-schema', `spec.notes.${target}`, 'notes entries must be an array'));
          continue;
        }
        entries.forEach((entry, i) => {
          if (!Array.isArray(entry) || entry.length !== 2) {
            errors.push(error('invalid-schema', `spec.notes.${target}.${i}`, 'note must be [index, text]'));
            return;
          }
          if (!Number.isInteger(entry[0])) {
            errors.push(error('invalid-schema', `spec.notes.${target}.${i}.0`, 'note target must be an integer'));
          }
          if (typeof entry[1] !== 'string') {
            errors.push(error('invalid-schema', `spec.notes.${target}.${i}.1`, 'note text must be a string'));
          }
        });
      }
    }
  }

  const timeline = prop(spec, 'timeline');
  if (timeline !== undefined) {
    if (!isRecord(timeline)) {
      errors.push(error('invalid-schema', 'spec.timeline', 'timeline must be an object'));
    } else {
      errors.push(...validateTimelineStructure(timeline, schemaVersion));
    }
  }

  const layout = prop(file, 'layout');
  if (layout !== undefined) {
    if (!isRecord(layout)) {
      errors.push(error('invalid-schema', 'layout', 'layout must be an object'));
    } else {
      const positions = prop(layout, 'positions');
      if (!Array.isArray(positions)) {
        errors.push(error('invalid-schema', 'layout.positions', 'layout positions must be an array'));
      } else {
        positions.forEach((position, i) => {
          if (!Array.isArray(position) || position.length !== 2) {
            errors.push(error('invalid-schema', `layout.positions.${i}`, 'position must be [x, y]'));
            return;
          }
          if (!isFiniteNumber(position[0]) || !isFiniteNumber(position[1])) {
            errors.push(error('invalid-schema', `layout.positions.${i}`, 'position values must be finite numbers'));
          }
        });
      }
      if (typeof prop(layout, 'specHash') !== 'string') {
        errors.push(error('invalid-schema', 'layout.specHash', 'specHash must be a string'));
      }
      if (typeof prop(layout, 'algorithmVersion') !== 'string') {
        errors.push(error('invalid-schema', 'layout.algorithmVersion', 'algorithmVersion must be a string'));
      }
    }
  }

  return errors;
}

function validateTimelineContent(
  timeline: Record<string, unknown>,
  counts: Record<CooccurrenceSliceTarget, number>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const slices = prop(timeline, 'slices');
  if (!Array.isArray(slices)) return errors;

  if (slices.length > COOCCURRENCE_SLICE_MAX) {
    errors.push(
      error('too-many-slices', 'spec.timeline.slices', `timeline must not exceed ${COOCCURRENCE_SLICE_MAX} slices`),
    );
  }

  const firstIndexByLabel = new Map<string, number>();
  let previousAt: number | undefined;
  slices.forEach((slice, i) => {
    if (!isRecord(slice)) return;
    const label = prop(slice, 'label');
    if (typeof label === 'string') {
      if (label === '') {
        errors.push(error('empty-slice-label', `spec.timeline.slices.${i}.label`, 'slice label must not be empty'));
      }
      const firstIndex = firstIndexByLabel.get(label);
      if (firstIndex === undefined) {
        firstIndexByLabel.set(label, i);
      } else {
        errors.push(
          error(
            'duplicate-slice-label',
            `spec.timeline.slices.${i}.label`,
            `slice label "${label}" duplicates spec.timeline.slices.${firstIndex}`,
          ),
        );
      }
    }
    const at = prop(slice, 'at');
    if (typeof at !== 'string') return;
    const value = cooccurrenceSliceDateValue(at);
    if (value === undefined) {
      errors.push(error('invalid-slice-date', `spec.timeline.slices.${i}.at`, 'slice at must be an ISO 8601 date'));
      return;
    }
    // 配列の順序が時間順であるという規則（設計書 §2.2）を、日付を持つスライスの間で検査する。
    if (previousAt !== undefined && value < previousAt) {
      errors.push(
        error(
          'slice-order-not-chronological',
          `spec.timeline.slices.${i}.at`,
          'slices with a date must be in chronological order',
        ),
      );
    }
    previousAt = value;
  });

  let entryCount = 0;
  for (const target of COOCCURRENCE_SLICE_TARGETS) {
    const perSlice = prop(timeline, target);
    if (!Array.isArray(perSlice)) continue;
    if (perSlice.length !== slices.length) {
      errors.push(
        error(
          'slice-count-mismatch',
          `spec.timeline.${target}`,
          `timeline ${target} length must match slices length`,
        ),
      );
    }
    perSlice.forEach((entries, sliceIndex) => {
      if (!Array.isArray(entries)) return;
      entryCount += entries.length;
      const seen = new Set<number>();
      entries.forEach((entry, i) => {
        if (!Array.isArray(entry) || entry.length !== 2) return;
        const index = entry[0];
        const value = entry[1];
        const path = `spec.timeline.${target}.${sliceIndex}.${i}`;
        if (Number.isInteger(index)) {
          if (!isIndex(index, counts[target])) {
            errors.push(error('slice-target-out-of-range', `${path}.0`, `slice entry target is outside ${target}`));
          }
          if (seen.has(index)) {
            errors.push(
              error('duplicate-slice-target', `${path}.0`, `slice entry target ${index} appears twice in this slice`),
            );
          }
          seen.add(index);
        }
        // 不在は「エントリが現れないこと」で表す。0 を許すと同じ状態に 2 通りの表現ができる（§2.2）。
        if (isFiniteNumber(value) && value <= 0) {
          errors.push(error('non-positive-slice-value', `${path}.1`, 'slice entry value must be positive'));
        }
      });
    });
  }

  if (entryCount > COOCCURRENCE_SLICE_ENTRY_MAX) {
    errors.push(
      error(
        'too-many-slice-entries',
        'spec.timeline',
        `timeline must not exceed ${COOCCURRENCE_SLICE_ENTRY_MAX} entries in total`,
      ),
    );
  }

  return errors;
}

/** 生の（未検証の）時間軸から全体値の合計を求める。検証は spec の値とこれを突き合わせる。 */
function rawSliceTotals(timeline: Record<string, unknown>, target: CooccurrenceSliceTarget, count: number): number[] {
  const totals = new Array<number>(count).fill(0);
  const perSlice = prop(timeline, target);
  if (!Array.isArray(perSlice)) return totals;
  for (const entries of perSlice) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const index = entry[0];
      const value = entry[1];
      if (Number.isInteger(index) && index >= 0 && index < count && isFiniteNumber(value)) totals[index] += value;
    }
  }
  return totals.map(roundCooccurrenceTotal);
}

export function validateCooccurrenceFile(file: unknown): ValidationError[] {
  const errors = validateStructure(file);
  if (!isRecord(file)) return errors;
  const spec = prop(file, 'spec');
  if (!isRecord(spec)) return errors;

  const nodes = prop(spec, 'nodes');
  const nodeCount = Array.isArray(nodes) ? nodes.length : 0;
  if (Array.isArray(nodes)) {
    const firstIndexByLabel = new Map<string, number>();
    nodes.forEach((node, i) => {
      if (!isRecord(node)) return;
      const label = prop(node, 'label');
      if (typeof label === 'string') {
        const firstIndex = firstIndexByLabel.get(label);
        if (firstIndex === undefined) {
          firstIndexByLabel.set(label, i);
        } else {
          errors.push(
            error('duplicate-node-label', `spec.nodes.${i}.label`, `node label "${label}" duplicates spec.nodes.${firstIndex}`),
          );
        }
      }
      const frequency = prop(node, 'frequency');
      if (isFiniteNumber(frequency) && frequency < 0) {
        errors.push(error('negative-frequency', `spec.nodes.${i}.frequency`, 'node frequency must not be negative'));
      }
    });
  }

  const links = prop(spec, 'links');
  if (Array.isArray(links)) {
    links.forEach((link, i) => {
      // 長さで早期 return すると、向き付き（4 要素）の共起だけが自己共起・端点の範囲・負の強度の
      // 検証を素通りする。構造の検証（validateStructure）と内容の検証はループが別なので、
      // 受け入れる長さを両方で揃える。
      if (!Array.isArray(link) || (link.length !== 3 && link.length !== 4)) return;
      const a = link[0];
      const b = link[1];
      const strength = link[2];
      if (Number.isInteger(a) && Number.isInteger(b)) {
        if (a === b) {
          errors.push(error('self-cooccurrence', `spec.links.${i}`, 'cooccurrence endpoints must be different'));
        }
        if (!isIndex(a, nodeCount)) {
          errors.push(error('link-endpoint-out-of-range', `spec.links.${i}.0`, 'link source is outside nodes'));
        }
        if (!isIndex(b, nodeCount)) {
          errors.push(error('link-endpoint-out-of-range', `spec.links.${i}.1`, 'link target is outside nodes'));
        }
      }
      if (isFiniteNumber(strength) && strength < 0) {
        errors.push(error('negative-link-strength', `spec.links.${i}.2`, 'link strength must not be negative'));
      }
    });
  }

  const subject = prop(spec, 'subject');
  if (subject !== undefined && Number.isInteger(subject) && !isIndex(subject, nodeCount)) {
    errors.push(error('node-reference-out-of-range', 'spec.subject', 'subject is outside nodes'));
  }

  const clusters = prop(spec, 'clusters');
  if (Array.isArray(clusters)) {
    clusters.forEach((cluster, i) => {
      if (!isRecord(cluster)) return;
      const members = prop(cluster, 'members');
      if (!Array.isArray(members)) return;
      members.forEach((member, j) => {
        if (Number.isInteger(member) && !isIndex(member, nodeCount)) {
          errors.push(
            error('node-reference-out-of-range', `spec.clusters.${i}.members.${j}`, 'cluster member is outside nodes'),
          );
        }
      });
    });
  }

  const notes = prop(spec, 'notes');
  if (isRecord(notes)) {
    const countByTarget: Record<CooccurrenceNoteTarget, number> = {
      nodes: nodeCount,
      links: Array.isArray(links) ? links.length : 0,
      clusters: Array.isArray(clusters) ? clusters.length : 0,
    };
    for (const target of COOCCURRENCE_NOTE_TARGETS) {
      const entries = prop(notes, target);
      if (!Array.isArray(entries)) continue;
      const seen = new Set<number>();
      entries.forEach((entry, i) => {
        if (!Array.isArray(entry) || entry.length !== 2) return;
        const index = entry[0];
        const text = entry[1];
        const path = `spec.notes.${target}.${i}`;
        if (Number.isInteger(index)) {
          if (!isIndex(index, countByTarget[target])) {
            errors.push(error('note-target-out-of-range', `${path}.0`, `note target is outside ${target}`));
          }
          if (seen.has(index)) {
            errors.push(error('duplicate-note-target', `${path}.0`, `note target ${index} is already noted`));
          }
          seen.add(index);
        }
        if (typeof text === 'string') {
          // 空文字を許すと「メモが無い」状態に 2 通りの表現ができ、往復一致と版数の導出が揺れる。
          if (text === '') errors.push(error('empty-note', `${path}.1`, 'note text must not be empty'));
          if (text.length > COOCCURRENCE_NOTE_MAX_LENGTH) {
            errors.push(
              error('note-too-long', `${path}.1`, `note text must not exceed ${COOCCURRENCE_NOTE_MAX_LENGTH} characters`),
            );
          }
        }
      });
    }
  }

  const timeline = prop(spec, 'timeline');
  if (isRecord(timeline)) {
    const linkCount = Array.isArray(links) ? links.length : 0;
    errors.push(...validateTimelineContent(timeline, { nodes: nodeCount, links: linkCount }));

    const slices = prop(timeline, 'slices');
    if (Array.isArray(slices) && slices.length > 0) {
      // 全体値はスライス値の合計として導出される（設計書 §2.2）。取り残された全体値を受理すると、
      // 単一表示とレイヤー表示で別の大きさの円が描かれる。
      const nodeTotals = rawSliceTotals(timeline, 'nodes', nodeCount);
      if (Array.isArray(nodes)) {
        nodes.forEach((node, i) => {
          if (!isRecord(node)) return;
          const frequency = prop(node, 'frequency');
          if (isFiniteNumber(frequency) && roundCooccurrenceTotal(frequency) !== nodeTotals[i]) {
            errors.push(
              error(
                'total-not-derived',
                `spec.nodes.${i}.frequency`,
                `frequency must equal the sum of slice values (${nodeTotals[i]})`,
              ),
            );
          }
        });
      }

      const linkTotals = rawSliceTotals(timeline, 'links', linkCount);
      if (Array.isArray(links)) {
        links.forEach((link, i) => {
          if (!Array.isArray(link) || (link.length !== 3 && link.length !== 4)) return;
          const strength = link[2];
          if (isFiniteNumber(strength) && roundCooccurrenceTotal(strength) !== linkTotals[i]) {
            errors.push(
              error(
                'total-not-derived',
                `spec.links.${i}.2`,
                `strength must equal the sum of slice values (${linkTotals[i]})`,
              ),
            );
          }
        });
      }
    }
  }

  const fileLayout = prop(file, 'layout');
  if (isRecord(fileLayout)) {
    const positions = prop(fileLayout, 'positions');
    if (Array.isArray(positions) && positions.length !== nodeCountOfSpec(spec)) {
      errors.push(
        error('layout-position-count-mismatch', 'layout.positions', 'layout positions length must match nodes length'),
      );
    }
  }

  return errors;
}

function isCooccurrenceFile(file: unknown): file is CooccurrenceFile {
  return validateCooccurrenceFile(file).length === 0;
}

/**
 * キーを UTF-16 コードユニット順で比較する（既定の `Array.prototype.sort` と同一順序）。
 *
 * Why not localeCompare: 正規化結果は `computeSpecHash` の入力であり、同じ spec は
 * どの環境でも同じハッシュにならなければならない。`localeCompare` はロケールと ICU
 * データに依存するため、実行環境が変わると順序が変わりハッシュが不安定になる。
 * ここで必要なのは「言語的に正しい並び」ではなく「決定論的な並び」。
 */
function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function canonicalValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value === null || typeof value !== 'object') return value;

  const ordered: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    ordered[key] = canonicalValue(value[key]);
  }
  return ordered;
}

export function canonicalizeSpec(spec: CooccurrenceFile['spec']): string {
  // spec は JSON として書き出せる値だけで構成されるが、名前付きの省略可能フィールドを持つため
  // `JsonValue` のインデックスシグネチャに構造的には適合しない。JSON へ落とす直前の 1 箇所だけで
  // 橋渡しする（`canonicalValue` 側を緩めると、順序の正規化が任意の値に対して働くように見える）。
  return JSON.stringify(canonicalValue(JSON.parse(JSON.stringify(spec)) as JsonValue));
}

export function computeSpecHash(spec: CooccurrenceFile['spec']): string {
  // 向きは座標に影響しない（力学モデルは強度だけを見る）。ハッシュへ含めると、矢印を 1 本足した
  // だけで 1,000 語の再計算（約 2.2 秒）が走る（設計書 §2.4）。
  // メモも同じ理由で外す。メモは編集中に何度も変わり、含めると 1 件書き足すたびに再計算が走る。
  // 時間軸も外す。レイアウトは全期間の和集合に対して 1 回だけ計算し、全レイヤーがその座標を
  // 共有する（設計書 §3.6.1）。スライスは描画対象の選択と値の差し替えにしか効かない。
  const { notes: _notes, timeline: _timeline, ...withoutDerived } = spec;
  const forHash: CooccurrenceFile['spec'] = {
    ...withoutDerived,
    links: spec.links.map((link) => [link[0], link[1], link[2]]),
  };
  return sha256Hex(canonicalizeSpec(forHash));
}

function roundPosition(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 時間軸を持つ spec の全体値をスライス値の合計で埋め直す。時間軸が無ければそのまま返す
 * （設計書 §2.2）。
 *
 * Why not 書き手が全体値も指定できるようにするか: 同じ量に対する真実が 2 箇所（全体値と
 * スライス値）にあると、片方だけ更新された中間状態が生まれ、単一表示とレイヤー表示で別の
 * 大きさの円が描かれる。版数を内容から導出するのと同じ理由による。
 */
export function withDerivedTotals(spec: CooccurrenceFile['spec']): CooccurrenceFile['spec'] {
  const timeline = spec.timeline;
  if (timeline === undefined || timeline.slices.length === 0) return spec;
  return {
    ...spec,
    nodes: spec.nodes.map((node, index) => ({
      ...node,
      frequency: totalCooccurrenceSliceValue(timeline, 'nodes', index),
    })),
    // writeLink を通すのは、全体値の差し替えで向きが落ちないようにするため。
    links: spec.links.map((link, index) =>
      writeLink({ ...readLink(link), strength: totalCooccurrenceSliceValue(timeline, 'links', index) }),
    ),
  };
}

export function serializeCoocFile(file: CooccurrenceFile): string {
  // スライスを 1 つも持たない時間軸は落とす。空の器を残すと版数の導出と往復一致が揺れる（§2.2）。
  const timeline = cloneCooccurrenceTimeline(file.spec.timeline);
  const compacted: CooccurrenceFile['spec'] = { ...file.spec };
  if (timeline === undefined) {
    delete compacted.timeline;
  } else {
    compacted.timeline = timeline;
  }

  // 全体値はスライス値の合計として導出する（§2.2）。書き出しで導出を通さないと、編集経路を
  // 1 つでも通し忘れたファイルが「合計と一致しない全体値」を持ったまま保存される。
  const derived = withDerivedTotals(compacted);

  // 無向は 3 要素へ畳む。畳んだ結果 4 要素が 1 本も無ければ版数は 1 のままで、旧実装との往復が
  // 保たれる（設計書 §2.2）。版数の判定を書き出しの一箇所へ集約し、編集経路ごとに繰り上げ条件が
  // 分かれる状態を作らない。
  const links = derived.links.map((link) => writeLink(readLink(link)));
  const notes = cloneCooccurrenceNotes(derived.notes);
  const spec: CooccurrenceFile['spec'] = { ...derived, links };
  if (notes === undefined) {
    delete spec.notes;
  } else {
    spec.notes = notes;
  }
  const serializable: CooccurrenceFile = {
    ...file,
    meta: { ...file.meta, schemaVersion: schemaVersionForSpec(spec) },
    spec,
    ...(file.layout
      ? {
          layout: {
            ...file.layout,
            positions: file.layout.positions.map((position) => [
              roundPosition(position[0]),
              roundPosition(position[1]),
            ]),
          },
        }
      : {}),
  };
  return JSON.stringify(serializable);
}

export function parseCoocFile(text: string): CooccurrenceFile {
  const parsed: unknown = JSON.parse(text);
  const errors = validateCooccurrenceFile(parsed);
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.code} at ${e.path}: ${e.message}`).join('; ');
    throw new Error(`Invalid .cooc.json: ${detail}`);
  }
  if (!isCooccurrenceFile(parsed)) {
    throw new Error('Invalid .cooc.json: validation did not narrow the parsed value');
  }
  return parsed;
}
