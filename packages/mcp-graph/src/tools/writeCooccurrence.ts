import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseCoocFile,
  serializeCoocFile,
  validateCooccurrenceFile,
  type CooccurrenceFile,
  type ValidationError,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { resolveSecurePath, validateCooccurrenceExtension } from '../utils/securePath';

export interface CooccurrenceTermInput {
  label: string;
  frequency: number;
}

export interface CooccurrenceLinkInput {
  source: string;
  target: string;
  strength: number;
}

export interface CooccurrenceClusterInput {
  label: string;
  members: string[];
}

export interface WriteCooccurrenceInput {
  path: string;
  mode: 'replace' | 'append';
  title?: string;
  subject?: string;
  terms: CooccurrenceTermInput[];
  links: CooccurrenceLinkInput[];
  clusters?: CooccurrenceClusterInput[];
}

export interface WriteCooccurrenceResult {
  ok: boolean;
  path: string;
  errors?: ValidationError[];
  title?: string;
  subject?: string;
  terms?: CooccurrenceTermInput[];
  links?: CooccurrenceLinkInput[];
  clusters?: CooccurrenceClusterInput[];
}

interface BuildResult {
  ok: boolean;
  path: string;
  errors?: ValidationError[];
  file?: CooccurrenceFile;
}

function validationError(code: ValidationError['code'], errorPath: string, message: string): ValidationError {
  return { code, path: errorPath, message };
}

function indexByLabel(nodes: CooccurrenceFile['spec']['nodes']): Map<string, number> {
  const indexes = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (!indexes.has(node.label)) indexes.set(node.label, index);
  });
  return indexes;
}

function emptyFile(title: string | undefined): CooccurrenceFile {
  const spec: CooccurrenceFile['spec'] = { nodes: [], links: [] };
  if (title !== undefined) spec.title = title;
  return {
    meta: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      origin: 'mcp',
    },
    spec,
  };
}

function withMeta(file: CooccurrenceFile): CooccurrenceFile {
  return {
    ...file,
    meta: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      origin: 'mcp',
    },
  };
}

async function readExisting(filePath: string): Promise<CooccurrenceFile | undefined> {
  try {
    return parseCoocFile(await fs.readFile(filePath, 'utf-8'));
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function addTerms(
  file: CooccurrenceFile,
  terms: CooccurrenceTermInput[],
  mode: WriteCooccurrenceInput['mode'],
): Map<string, number> {
  const indexes = indexByLabel(file.spec.nodes);
  const originalLabels = new Set(indexes.keys());
  const duplicateInputLabels = new Set<string>();
  const seenInputLabels = new Set<string>();

  terms.forEach((term) => {
    if (seenInputLabels.has(term.label)) duplicateInputLabels.add(term.label);
    seenInputLabels.add(term.label);
  });

  terms.forEach((term) => {
    const existingIndex = indexes.get(term.label);
    if (mode === 'append' && existingIndex !== undefined && originalLabels.has(term.label)) {
      /*
       * 追記で既存語と同名の語が来た場合は既存ノードを再利用し、頻度だけ更新する。
       * 同名語を別ノードとして追加すると `.cooc.json` の同一性規則と重複語名禁止に反するため。
       */
      file.spec.nodes[existingIndex] = { label: term.label, frequency: term.frequency };
      return;
    }

    file.spec.nodes.push({ label: term.label, frequency: term.frequency });
    if (!duplicateInputLabels.has(term.label)) indexes.set(term.label, file.spec.nodes.length - 1);
  });

  return indexByLabel(file.spec.nodes);
}

function resolveLabel(indexes: Map<string, number>, label: string, inputPath: string): number | ValidationError {
  const index = indexes.get(label);
  if (index === undefined) {
    return validationError('node-reference-out-of-range', inputPath, `term "${label}" is not defined`);
  }
  return index;
}

function addLinks(
  file: CooccurrenceFile,
  links: CooccurrenceLinkInput[],
  indexes: Map<string, number>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  links.forEach((link, i) => {
    const source = resolveLabel(indexes, link.source, `links.${i}.source`);
    const target = resolveLabel(indexes, link.target, `links.${i}.target`);
    if (typeof source !== 'number') {
      errors.push(source);
      return;
    }
    if (typeof target !== 'number') {
      errors.push(target);
      return;
    }
    file.spec.links.push([source, target, link.strength]);
  });
  return errors;
}

function addClusters(
  file: CooccurrenceFile,
  clusters: CooccurrenceClusterInput[] | undefined,
  indexes: Map<string, number>,
): ValidationError[] {
  if (clusters === undefined) return [];

  const errors: ValidationError[] = [];
  const converted: CooccurrenceFile['spec']['clusters'] = file.spec.clusters ? [...file.spec.clusters] : [];
  clusters.forEach((cluster, i) => {
    const members: number[] = [];
    cluster.members.forEach((member, j) => {
      const index = resolveLabel(indexes, member, `clusters.${i}.members.${j}`);
      if (typeof index === 'number') {
        members.push(index);
      } else {
        errors.push(index);
      }
    });
    converted.push({ label: cluster.label, members });
  });
  file.spec.clusters = converted;
  return errors;
}

function toResult(pathName: string, file: CooccurrenceFile): WriteCooccurrenceResult {
  const result: WriteCooccurrenceResult = {
    ok: true,
    path: pathName,
    terms: file.spec.nodes.map((node) => ({ label: node.label, frequency: node.frequency })),
    links: file.spec.links.map(([source, target, strength]) => ({
      source: file.spec.nodes[source].label,
      target: file.spec.nodes[target].label,
      strength,
    })),
  };
  if (file.spec.title !== undefined) result.title = file.spec.title;
  if (file.spec.subject !== undefined) result.subject = file.spec.nodes[file.spec.subject].label;
  if (file.spec.clusters !== undefined) {
    result.clusters = file.spec.clusters.map((cluster) => ({
      label: cluster.label,
      members: cluster.members.map((member) => file.spec.nodes[member].label),
    }));
  }
  return result;
}

function applyInput(base: CooccurrenceFile, input: WriteCooccurrenceInput): BuildResult {
  const file = withMeta(base);
  /*
   * 書き込みは spec を変える経路なので、古い座標キャッシュは保存しない。
   * positions は nodes と同じ長さでなければならず、流用すると検証失敗または誤表示になる。
   */
  delete file.layout;
  if (input.title !== undefined) file.spec.title = input.title;

  const indexes = addTerms(file, input.terms, input.mode);
  const labelErrors = [
    ...addLinks(file, input.links, indexes),
    ...addClusters(file, input.clusters, indexes),
  ];

  if (input.subject !== undefined) {
    const subject = resolveLabel(indexes, input.subject, 'subject');
    if (typeof subject === 'number') {
      file.spec.subject = subject;
    } else {
      labelErrors.push(subject);
    }
  }

  const errors = [...labelErrors, ...validateCooccurrenceFile(file)];
  if (errors.length > 0) return { ok: false, path: input.path, errors };
  return { ok: true, path: input.path, file };
}

export async function writeCooccurrence(
  input: WriteCooccurrenceInput,
  rootDir: string,
): Promise<WriteCooccurrenceResult> {
  validateCooccurrenceExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const existing = input.mode === 'append' ? await readExisting(filePath) : undefined;
  const base = input.mode === 'append' && existing !== undefined ? existing : emptyFile(input.title);
  const result = applyInput(base, input);
  if (!result.ok || result.file === undefined) return result;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeCoocFile(result.file), 'utf-8');
  return toResult(input.path, result.file);
}
