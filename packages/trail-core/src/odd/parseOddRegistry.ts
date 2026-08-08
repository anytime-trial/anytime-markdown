import * as path from 'node:path';

import type {
  ApprovalVerdict,
  NarrowingState,
  OddRegistry,
  OperationKind,
  RestrictedEntry,
} from './types';
import { OPERATION_KINDS } from './types';

/**
 * レジストリの検証結果。zod を使わないのは、trail-core が依存を持たない純粋層で
 * あることと、パッケージ追加が承認事項であるため。手書きの検査で足りる規模。
 */
export type OddRegistryParseResult =
  | { readonly kind: 'ok'; readonly registry: OddRegistry }
  | { readonly kind: 'error'; readonly reason: string };

/**
 * 各フィールドの検証結果。**すべて判別子付きに揃える。**
 * 「成功値か error 文字列か」を `typeof x === 'string'` で分岐する方式は、正常値も
 * 文字列になる項目（`narrowing.state` 等）で取り違えを起こすうえ、呼び出し側の
 * 分岐が積み上がって認知的複雑度を押し上げる。
 */
type Parsed<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'error'; readonly reason: string };

function ok<T>(value: T): Parsed<T> {
  return { kind: 'ok', value };
}

function fail<T>(reason: string): Parsed<T> {
  return { kind: 'error', reason };
}

const VERDICTS: readonly ApprovalVerdict[] = ['allow', 'confirm', 'deny'];
const NARROWING_STATES: readonly NarrowingState[] = ['normal', 'release_freeze', 'incident'];

const DEFAULT_GOD_NODE_PERCENTILE = 5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown, field: string): Parsed<readonly string[]> {
  if (!Array.isArray(value)) {
    return fail(`${field} must be an array of strings`);
  }
  if (value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    return fail(`${field} must contain only non-empty strings`);
  }
  return ok(value as readonly string[]);
}

function parseRoots(value: unknown): Parsed<readonly string[]> {
  const parsed = parseStringArray(value, 'roots');
  if (parsed.kind === 'error') {
    return parsed;
  }
  if (parsed.value.length === 0) {
    // ルート 0 件は「ODD が空」であり、すべての判断が odd_out になる。設定ミスと
    // 区別できないため設定エラーとして扱う
    return fail('roots must not be empty');
  }
  // 相対 root は process.cwd() 基準で解決されるため、`".."` を書くと MCP プロセスの
  // 起動場所次第で ODD がワークスペース外へ広がる。`~` も展開しないのでここで弾く
  const relative = parsed.value.find((root) => !path.isAbsolute(root));
  if (relative !== undefined) {
    return fail(`roots must be absolute paths (got '${relative}')`);
  }
  return parsed;
}

function parseRestrictedEntry(raw: unknown, index: number): Parsed<RestrictedEntry> {
  if (!isPlainObject(raw)) {
    return fail(`restricted[${index}] must be an object`);
  }
  const kind = raw['kind'];
  if (kind !== 'prefix' && kind !== 'pattern') {
    return fail(`restricted[${index}].kind must be 'prefix' or 'pattern'`);
  }
  const value = raw['value'];
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(`restricted[${index}].value must be a non-empty string`);
  }
  if (kind === 'prefix' && !path.isAbsolute(value)) {
    // prefix は前方一致に使うため、相対だと process.cwd() 基準になり判定が実行環境
    // 依存になる。`~/.claude` も展開されないため、書いた保護が黙って無効化される
    return fail(`restricted[${index}].value must be an absolute path when kind is 'prefix'`);
  }
  const note = raw['note'];
  if (note !== undefined && typeof note !== 'string') {
    return fail(`restricted[${index}].note must be a string`);
  }
  return ok(note === undefined ? { kind, value } : { kind, value, note });
}

function parseRestricted(value: unknown): Parsed<readonly RestrictedEntry[]> {
  if (!Array.isArray(value)) {
    return fail('restricted must be an array');
  }
  const entries: RestrictedEntry[] = [];
  for (const [index, raw] of value.entries()) {
    const parsed = parseRestrictedEntry(raw, index);
    if (parsed.kind === 'error') {
      return parsed;
    }
    entries.push(parsed.value);
  }
  return ok(entries);
}

function parseLanguages(value: unknown): Parsed<readonly string[] | null> {
  // 未指定 (null) は「制限しない」、空配列は「許容言語なし」。同じ意味にすると
  // 書き忘れが黙って全許可になる
  if (value === undefined) {
    return ok(null);
  }
  return parseStringArray(value, 'languages');
}

function parseOperations(
  value: unknown,
): Parsed<Readonly<Partial<Record<OperationKind, ApprovalVerdict>>>> {
  if (value === undefined) {
    return ok({});
  }
  if (!isPlainObject(value)) {
    return fail('operations must be an object');
  }
  const operations: Partial<Record<OperationKind, ApprovalVerdict>> = {};
  for (const [key, verdict] of Object.entries(value)) {
    if (!(OPERATION_KINDS as readonly string[]).includes(key)) {
      // 未知の種別を黙って捨てると、綴り違いのポリシーが「書いたのに効かない」状態になる
      return fail(`operations has unknown operation kind '${key}'`);
    }
    if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) {
      return fail(`operations.${key} must be one of allow / confirm / deny`);
    }
    operations[key as OperationKind] = verdict as ApprovalVerdict;
  }
  return ok(operations);
}

function parseNarrowing(value: unknown): Parsed<NarrowingState> {
  if (value === undefined) {
    return ok('normal');
  }
  if (!isPlainObject(value)) {
    return fail('narrowing must be an object');
  }
  const state = value['state'];
  if (state === undefined) {
    return ok('normal');
  }
  if (typeof state !== 'string' || !(NARROWING_STATES as readonly string[]).includes(state)) {
    return fail(`narrowing.state must be one of ${NARROWING_STATES.join(' / ')}`);
  }
  return ok(state as NarrowingState);
}

function parseImpact(value: unknown): Parsed<number> {
  if (value === undefined) {
    return ok(DEFAULT_GOD_NODE_PERCENTILE);
  }
  if (!isPlainObject(value)) {
    return fail('impact must be an object');
  }
  const percentile = value['godNodePercentile'];
  if (percentile === undefined) {
    return ok(DEFAULT_GOD_NODE_PERCENTILE);
  }
  if (
    typeof percentile !== 'number' ||
    !Number.isFinite(percentile) ||
    percentile <= 0 ||
    percentile > 100
  ) {
    return fail('impact.godNodePercentile must be a number in (0, 100]');
  }
  return ok(percentile);
}

function parseRoot(content: string): Parsed<Record<string, unknown>> {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    return fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(raw)) {
    return fail('root must be an object');
  }
  if (raw['version'] !== 1) {
    return fail(`unsupported version: ${JSON.stringify(raw['version'])}`);
  }
  return ok(raw);
}

/**
 * ODD レジストリ (`.anytime/trail/odd.json`) の本文を検証して構造化する。
 *
 * **検証に落ちた場合は既定値で埋めず error を返す。** 呼び出し側はこれを
 * 「ODD 判定不能」として扱い、自律実行を止める側へ倒す (仕様 §3.3)。
 */
export function parseOddRegistry(content: string): OddRegistryParseResult {
  const root = parseRoot(content);
  if (root.kind === 'error') {
    return { kind: 'error', reason: root.reason };
  }
  const raw = root.value;

  const roots = parseRoots(raw['roots']);
  if (roots.kind === 'error') {
    return { kind: 'error', reason: roots.reason };
  }
  const restricted = parseRestricted(raw['restricted']);
  if (restricted.kind === 'error') {
    return { kind: 'error', reason: restricted.reason };
  }
  const languages = parseLanguages(raw['languages']);
  if (languages.kind === 'error') {
    return { kind: 'error', reason: languages.reason };
  }
  const operations = parseOperations(raw['operations']);
  if (operations.kind === 'error') {
    return { kind: 'error', reason: operations.reason };
  }
  const narrowing = parseNarrowing(raw['narrowing']);
  if (narrowing.kind === 'error') {
    return { kind: 'error', reason: narrowing.reason };
  }
  const impact = parseImpact(raw['impact']);
  if (impact.kind === 'error') {
    return { kind: 'error', reason: impact.reason };
  }

  return {
    kind: 'ok',
    registry: {
      version: 1,
      roots: roots.value,
      restricted: restricted.value,
      languages: languages.value,
      operations: operations.value,
      narrowing: narrowing.value,
      godNodePercentile: impact.value,
    },
  };
}
