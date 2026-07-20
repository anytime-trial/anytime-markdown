import { createHash } from 'node:crypto';

export interface CooccurrenceFile {
  meta: {
    /** スキーマの版数。互換性のない変更で繰り上げる。 */
    schemaVersion: 1;
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
    /** 共起。[語の添字, 語の添字, 強度]。 */
    links: Array<[number, number, number]>;
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

  const meta = prop(file, 'meta');
  if (!isRecord(meta)) {
    errors.push(error('invalid-schema', 'meta', 'meta must be an object'));
  } else {
    if (prop(meta, 'schemaVersion') !== 1) {
      errors.push(error('invalid-schema', 'meta.schemaVersion', 'schemaVersion must be 1'));
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
      if (!Array.isArray(link) || link.length !== 3) {
        errors.push(error('invalid-schema', `spec.links.${i}`, 'link must be [source, target, strength]'));
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

function canonicalValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value === null || typeof value !== 'object') return value;

  const ordered: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    ordered[key] = canonicalValue(value[key]);
  }
  return ordered;
}

export function canonicalizeSpec(spec: CooccurrenceFile['spec']): string {
  return JSON.stringify(canonicalValue(spec));
}

export function computeSpecHash(spec: CooccurrenceFile['spec']): string {
  return createHash('sha256').update(canonicalizeSpec(spec)).digest('hex');
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
