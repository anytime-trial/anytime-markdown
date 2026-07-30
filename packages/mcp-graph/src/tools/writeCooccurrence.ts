import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseCoocFile,
  readLink,
  schemaVersionForSpec,
  serializeCoocFile,
  validateCooccurrenceFile,
  writeLink,
  type CooccurrenceFile,
  type ValidationError,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import {
  readCooccurrenceNote,
  withCooccurrenceNote,
  type CooccurrenceNoteTarget,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceNotes';
import {
  hasCooccurrenceTimeline,
  readCooccurrenceSliceValue,
  roundCooccurrenceTotal,
  withCooccurrenceSliceValue,
  type CooccurrenceSlice,
  type CooccurrenceSliceTarget,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceTimeline';
import { withDerivedTotals } from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { resolveSecurePath, validateCooccurrenceExtension } from '../utils/securePath';
import { DIRECTION_BY_NAME, directionNameOf, type CooccurrenceDirectionName } from './cooccurrenceDirection';

/**
 * スライス別の値。**スライスのラベル**をキーにする（設計書 §5）。
 *
 * Why not スライスの添字をキーにするか: 呼び出し側が語を 1 つずつ書き込む間にスライスを 1 つ
 * 挿入すると、それ以前の呼び出しが指していた対象が黙ってずれる。ラベルは書き手が意図して
 * 付けた識別子であり、並びが変わっても同じスライスを指し続ける。
 */
export type CooccurrenceSliceValueInput = Record<string, number>;

export interface CooccurrenceTermInput {
  label: string;
  /** 時間軸を持たない図で使う全体値。時間軸があるときは書かない（合計から導出される。§2.2）。 */
  frequency?: number;
  /** 時間軸を持つ図で使うスライス別の頻度。キーはスライスのラベル。 */
  sliceValues?: CooccurrenceSliceValueInput;
  /** 省略時はメモなし。添字表現は外へ出さない（設計書 §5）。 */
  note?: string;
}

export interface CooccurrenceLinkInput {
  source: string;
  target: string;
  /** 時間軸を持たない図で使う全体値。時間軸があるときは書かない。 */
  strength?: number;
  /** 時間軸を持つ図で使うスライス別の強度。キーはスライスのラベル。 */
  sliceValues?: CooccurrenceSliceValueInput;
  /** 省略時は無向。ファイル内部の数値コードは外へ出さない（設計書 §5）。 */
  direction?: CooccurrenceDirectionName;
  /** 省略時はメモなし。 */
  note?: string;
}

export interface CooccurrenceClusterInput {
  label: string;
  members: string[];
  /** 省略時はメモなし。 */
  note?: string;
}

export interface WriteCooccurrenceInput {
  path: string;
  mode: 'replace' | 'append';
  title?: string;
  subject?: string;
  /** 時間軸のスライス。時間順に並べる。省略すると時間軸を持たない図になる（設計書 §3.6）。 */
  slices?: CooccurrenceSlice[];
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
  slices?: CooccurrenceSlice[];
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
      file.spec.nodes[existingIndex] = { label: term.label, frequency: term.frequency ?? 0 };
      return;
    }

    file.spec.nodes.push({ label: term.label, frequency: term.frequency ?? 0 });
    if (!duplicateInputLabels.has(term.label)) indexes.set(term.label, file.spec.nodes.length - 1);
  });

  return indexByLabel(file.spec.nodes);
}

/**
 * メモを対象の添字へ結びつける。
 *
 * 呼び出し側（Claude Code）は語名・両端・クラスタ名でしか対象を指さないため、添字への変換は
 * ここに閉じる。省略された `note` は書かない（空文字は §2.6 で不正であり、「省略＝メモなし」を
 * 空文字へ読み替えると、省略しただけの書き込みが検証で落ちる）。
 */
function attachNote(file: CooccurrenceFile, target: CooccurrenceNoteTarget, index: number, note: string | undefined): void {
  if (note === undefined) return;
  file.spec.notes = withCooccurrenceNote(file.spec.notes, target, index, note);
}

/**
 * スライス定義を spec へ据える。値は空で始め、語・共起の `sliceValues` が埋める。
 *
 * 追記（append）でスライスを与えたときも、与えられた定義で置き換える。既存と新規を混ぜると
 * 「どちらの並びが時間順か」を決める規則が新たに要り、ラベルの重複判定も 2 系統になる。
 */
function applySlices(file: CooccurrenceFile, slices: CooccurrenceSlice[]): Map<string, number> {
  const previous = file.spec.timeline;
  const indexes = new Map<string, number>();
  slices.forEach((slice, index) => {
    if (!indexes.has(slice.label)) indexes.set(slice.label, index);
  });
  file.spec.timeline = {
    slices: slices.map((slice) => (slice.at === undefined ? { label: slice.label } : { label: slice.label, at: slice.at })),
    // 既存のスライスと同じラベルの位置には、既存の値を持ち越す（追記で値が消えない）。
    nodes: slices.map((slice) => carryOver(previous, 'nodes', slice.label)),
    links: slices.map((slice) => carryOver(previous, 'links', slice.label)),
  };
  return indexes;
}

function carryOver(
  previous: CooccurrenceFile['spec']['timeline'],
  target: CooccurrenceSliceTarget,
  label: string,
): Array<[number, number]> {
  if (previous === undefined) return [];
  const index = previous.slices.findIndex((slice) => slice.label === label);
  if (index === -1) return [];
  return (previous[target][index] ?? []).map((entry): [number, number] => [entry[0], entry[1]]);
}

/**
 * スライス別の値を書き込む。未知のスライス名は誤りとして返す。
 *
 * Why not 未知の名前を黙って捨てるか: 書き手はスライス名を打ち間違えても「書けた」と受け取り、
 * その語だけどのレイヤーにも現れない図ができる。
 */
function attachSliceValues(
  file: CooccurrenceFile,
  target: CooccurrenceSliceTarget,
  index: number,
  sliceValues: CooccurrenceSliceValueInput | undefined,
  inputPath: string,
  sliceIndexes: Map<string, number>,
): ValidationError[] {
  if (sliceValues === undefined) return [];
  const errors: ValidationError[] = [];
  for (const [label, value] of Object.entries(sliceValues)) {
    const slice = sliceIndexes.get(label);
    if (slice === undefined) {
      errors.push(validationError('invalid-schema', `${inputPath}.${label}`, `slice "${label}" is not defined`));
      continue;
    }
    if (file.spec.timeline === undefined) continue;
    file.spec.timeline = withCooccurrenceSliceValue(file.spec.timeline, { target, slice, index }, value);
  }
  return errors;
}

/**
 * 時間軸を持つ図に対する入力の規則を課す（設計書 §2.2・§2.6）。
 *
 * Why not 導出（`withDerivedTotals`）に任せて黙って合計へ揃えるか: `sliceValues` を書かずに
 * `frequency` だけを渡した入力が「合計 0」へ潰され、`ok: true` でファイルが書き換わる。呼び出し側は
 * 書けたと受け取るが、その語はどのレイヤーにも現れない。同じ入力は graph-core の編集経路
 * （`addCooccurrenceNode`）では `slice-values-required` で拒否されるため、放置すると
 * 「UI からは拒否される入力が MCP からは通る」状態になり、§2.6 が守っている
 * 「経路によって受理されたり拒否されたりしない」が崩れる。
 */
function validateTimelineInput(input: WriteCooccurrenceInput, hasTimeline: boolean): ValidationError[] {
  if (!hasTimeline) return [];
  const errors: ValidationError[] = [];
  const check = (
    sliceValues: CooccurrenceSliceValueInput | undefined,
    total: number | undefined,
    inputPath: string,
    totalField: string,
  ): void => {
    if (sliceValues === undefined) {
      errors.push(
        validationError(
          'slice-values-required',
          inputPath,
          `file has a time axis; pass sliceValues instead of ${totalField}`,
        ),
      );
      return;
    }
    if (total === undefined) return;
    const sum = Object.values(sliceValues).reduce((accumulated, value) => accumulated + value, 0);
    if (roundCooccurrenceTotal(total) !== roundCooccurrenceTotal(sum)) {
      errors.push(
        validationError(
          'total-not-editable',
          `${inputPath}.${totalField}`,
          `${totalField} is derived from sliceValues (${roundCooccurrenceTotal(sum)}); omit it`,
        ),
      );
    }
  };
  input.terms.forEach((term, i) => check(term.sliceValues, term.frequency, `terms.${i}`, 'frequency'));
  input.links.forEach((link, i) => check(link.sliceValues, link.strength, `links.${i}`, 'strength'));
  return errors;
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
    file.spec.links.push(
      writeLink({
        source,
        target,
        strength: link.strength ?? 0,
        direction: DIRECTION_BY_NAME[link.direction ?? 'none'],
      }),
    );
    attachNote(file, 'links', file.spec.links.length - 1, link.note);
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
    attachNote(file, 'clusters', converted.length - 1, cluster.note);
  });
  file.spec.clusters = converted;
  return errors;
}

function noteField(file: CooccurrenceFile, target: CooccurrenceNoteTarget, index: number): { note?: string } {
  const note = readCooccurrenceNote(file.spec, target, index);
  return note === undefined ? {} : { note };
}

/** スライス別の値をラベル対応で返す。1 つも無ければ書かない（省略と空を同じ形にしない）。 */
export function sliceValuesField(
  file: CooccurrenceFile,
  target: CooccurrenceSliceTarget,
  index: number,
): { sliceValues?: CooccurrenceSliceValueInput } {
  const timeline = file.spec.timeline;
  if (timeline === undefined) return {};
  const values: CooccurrenceSliceValueInput = {};
  timeline.slices.forEach((slice, sliceIndex) => {
    const value = readCooccurrenceSliceValue(file.spec, { target, slice: sliceIndex, index });
    if (value !== undefined) values[slice.label] = value;
  });
  return Object.keys(values).length === 0 ? {} : { sliceValues: values };
}

function toResult(pathName: string, file: CooccurrenceFile): WriteCooccurrenceResult {
  const result: WriteCooccurrenceResult = {
    ok: true,
    path: pathName,
    terms: file.spec.nodes.map((node, index) => ({
      label: node.label,
      frequency: node.frequency,
      ...noteField(file, 'nodes', index),
      ...sliceValuesField(file, 'nodes', index),
    })),
    links: file.spec.links.map((link, index) => {
      const view = readLink(link);
      return {
        source: file.spec.nodes[view.source].label,
        target: file.spec.nodes[view.target].label,
        strength: view.strength,
        direction: directionNameOf(view.direction),
        ...noteField(file, 'links', index),
        ...sliceValuesField(file, 'links', index),
      };
    }),
  };
  if (file.spec.timeline !== undefined) {
    result.slices = file.spec.timeline.slices.map((slice) =>
      slice.at === undefined ? { label: slice.label } : { label: slice.label, at: slice.at },
    );
  }
  if (file.spec.title !== undefined) result.title = file.spec.title;
  if (file.spec.subject !== undefined) result.subject = file.spec.nodes[file.spec.subject].label;
  if (file.spec.clusters !== undefined) {
    result.clusters = file.spec.clusters.map((cluster, index) => ({
      label: cluster.label,
      members: cluster.members.map((member) => file.spec.nodes[member].label),
      ...noteField(file, 'clusters', index),
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

  // スライスを先に据える。語・共起の `sliceValues` はここで作った並びの添字へ落ちる。
  const sliceIndexes = input.slices === undefined ? new Map<string, number>() : applySlices(file, input.slices);

  const indexes = addTerms(file, input.terms, input.mode);
  const sliceErrors: ValidationError[] = [];
  input.terms.forEach((term, i) => {
    const index = indexes.get(term.label);
    if (index === undefined) return;
    attachNote(file, 'nodes', index, term.note);
    sliceErrors.push(...attachSliceValues(file, 'nodes', index, term.sliceValues, `terms.${i}.sliceValues`, sliceIndexes));
  });
  const linkStart = file.spec.links.length;
  const labelErrors = [
    ...addLinks(file, input.links, indexes),
    ...addClusters(file, input.clusters, indexes),
  ];
  input.links.forEach((link, i) => {
    const index = linkStart + i;
    if (index >= file.spec.links.length) return;
    sliceErrors.push(...attachSliceValues(file, 'links', index, link.sliceValues, `links.${i}.sliceValues`, sliceIndexes));
  });

  if (input.subject !== undefined) {
    const subject = resolveLabel(indexes, input.subject, 'subject');
    if (typeof subject === 'number') {
      file.spec.subject = subject;
    } else {
      labelErrors.push(subject);
    }
  }

  // 全体値はスライス値の合計から導出する（設計書 §2.2・§5）。書き手は全体値を指定しない。
  file.spec = withDerivedTotals(file.spec);

  // 版数は共起の内容から導出する（設計書 §2.2）。1 固定のままだと、向き付きの共起を書いた
  // ときに「版数と内容が一致しない」で自分の書き込みが検証に落ちる。
  file.meta.schemaVersion = schemaVersionForSpec(file.spec);

  const errors = [
    ...labelErrors,
    ...sliceErrors,
    ...validateTimelineInput(input, hasCooccurrenceTimeline(file.spec)),
    ...validateCooccurrenceFile(file),
  ];
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
