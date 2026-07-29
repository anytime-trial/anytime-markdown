import { sha256Hex } from './sha256';

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

export interface CooccurrenceFile {
  meta: {
    /** スキーマの版数。互換性のない変更で繰り上げる。向き付きの共起を含むとき 2（設計書 §2.2）。 */
    schemaVersion: 1 | 2;
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
  | 'layout-position-count-mismatch';

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
    if (schemaVersion !== 1 && schemaVersion !== 2) {
      errors.push(error('invalid-schema', 'meta.schemaVersion', 'schemaVersion must be 1 or 2'));
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
      if (!Array.isArray(link) || link.length !== 3) return;
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
  return JSON.stringify(canonicalValue(spec));
}

export function computeSpecHash(spec: CooccurrenceFile['spec']): string {
  // 向きは座標に影響しない（力学モデルは強度だけを見る）。ハッシュへ含めると、矢印を 1 本足した
  // だけで 1,000 語の再計算（約 2.2 秒）が走る（設計書 §2.4）。
  const forHash: CooccurrenceFile['spec'] = {
    ...spec,
    links: spec.links.map((link) => [link[0], link[1], link[2]]),
  };
  return sha256Hex(canonicalizeSpec(forHash));
}

function roundPosition(value: number): number {
  return Math.round(value * 10) / 10;
}

export function serializeCoocFile(file: CooccurrenceFile): string {
  const serializable: CooccurrenceFile = file.layout
    ? {
        ...file,
        layout: {
          ...file.layout,
          positions: file.layout.positions.map((position) => [roundPosition(position[0]), roundPosition(position[1])]),
        },
      }
    : file;
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
