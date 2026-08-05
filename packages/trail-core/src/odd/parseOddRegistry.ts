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

const VERDICTS: readonly ApprovalVerdict[] = ['allow', 'confirm', 'deny'];
const NARROWING_STATES: readonly NarrowingState[] = ['normal', 'release_freeze', 'incident'];

const DEFAULT_GOD_NODE_PERCENTILE = 5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown, field: string): readonly string[] | string {
  if (!Array.isArray(value)) {
    return `${field} must be an array of strings`;
  }
  if (value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    return `${field} must contain only non-empty strings`;
  }
  return value as readonly string[];
}

function parseRestricted(value: unknown): readonly RestrictedEntry[] | string {
  if (!Array.isArray(value)) {
    return 'restricted must be an array';
  }
  const entries: RestrictedEntry[] = [];
  for (const [index, raw] of value.entries()) {
    if (!isPlainObject(raw)) {
      return `restricted[${index}] must be an object`;
    }
    const kind = raw['kind'];
    if (kind !== 'prefix' && kind !== 'pattern') {
      return `restricted[${index}].kind must be 'prefix' or 'pattern'`;
    }
    const entryValue = raw['value'];
    if (typeof entryValue !== 'string' || entryValue.trim() === '') {
      return `restricted[${index}].value must be a non-empty string`;
    }
    const note = raw['note'];
    if (note !== undefined && typeof note !== 'string') {
      return `restricted[${index}].note must be a string`;
    }
    entries.push(note === undefined ? { kind, value: entryValue } : { kind, value: entryValue, note });
  }
  return entries;
}

function parseOperations(
  value: unknown,
): Readonly<Partial<Record<OperationKind, ApprovalVerdict>>> | string {
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    return 'operations must be an object';
  }
  const operations: Partial<Record<OperationKind, ApprovalVerdict>> = {};
  for (const [key, verdict] of Object.entries(value)) {
    if (!(OPERATION_KINDS as readonly string[]).includes(key)) {
      // 未知の種別を黙って捨てると、綴り違いのポリシーが「書いたのに効かない」状態になる
      return `operations has unknown operation kind '${key}'`;
    }
    if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) {
      return `operations.${key} must be one of allow / confirm / deny`;
    }
    operations[key as OperationKind] = verdict as ApprovalVerdict;
  }
  return operations;
}

/**
 * 正常値もエラーも文字列になる項目は、判別子付きで返す。`'normal'` とエラー
 * メッセージを同じ型で返すと、呼び出し側が両者を取り違える。
 */
type NarrowingParse =
  | { readonly kind: 'ok'; readonly state: NarrowingState }
  | { readonly kind: 'error'; readonly reason: string };

function parseNarrowing(value: unknown): NarrowingParse {
  if (value === undefined) {
    return { kind: 'ok', state: 'normal' };
  }
  if (!isPlainObject(value)) {
    return { kind: 'error', reason: 'narrowing must be an object' };
  }
  const state = value['state'];
  if (state === undefined) {
    return { kind: 'ok', state: 'normal' };
  }
  if (typeof state !== 'string' || !(NARROWING_STATES as readonly string[]).includes(state)) {
    return {
      kind: 'error',
      reason: `narrowing.state must be one of ${NARROWING_STATES.join(' / ')}`,
    };
  }
  return { kind: 'ok', state: state as NarrowingState };
}

function parseGodNodePercentile(value: unknown): number | string {
  if (value === undefined) {
    return DEFAULT_GOD_NODE_PERCENTILE;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100) {
    return 'impact.godNodePercentile must be a number in (0, 100]';
  }
  return value;
}

/**
 * ODD レジストリ (`.anytime/trail/odd.json`) の本文を検証して構造化する。
 *
 * **検証に落ちた場合は既定値で埋めず error を返す。** 呼び出し側はこれを
 * 「ODD 判定不能」として扱い、自律実行を止める側へ倒す (仕様 §3.3)。
 */
export function parseOddRegistry(content: string): OddRegistryParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    return {
      kind: 'error',
      reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!isPlainObject(raw)) {
    return { kind: 'error', reason: 'root must be an object' };
  }
  if (raw['version'] !== 1) {
    return { kind: 'error', reason: `unsupported version: ${JSON.stringify(raw['version'])}` };
  }

  const roots = parseStringArray(raw['roots'], 'roots');
  if (typeof roots === 'string') {
    return { kind: 'error', reason: roots };
  }
  if (roots.length === 0) {
    // ルート 0 件は「ODD が空」であり、すべての判断が odd_out になる。設定ミスと
    // 区別できないため設定エラーとして扱う
    return { kind: 'error', reason: 'roots must not be empty' };
  }

  const restricted = parseRestricted(raw['restricted']);
  if (typeof restricted === 'string') {
    return { kind: 'error', reason: restricted };
  }

  const languagesRaw = raw['languages'];
  let languages: readonly string[] | null;
  if (languagesRaw === undefined) {
    languages = null;
  } else {
    const parsed = parseStringArray(languagesRaw, 'languages');
    if (typeof parsed === 'string') {
      return { kind: 'error', reason: parsed };
    }
    languages = parsed;
  }

  const operations = parseOperations(raw['operations']);
  if (typeof operations === 'string') {
    return { kind: 'error', reason: operations };
  }

  const narrowing = parseNarrowing(raw['narrowing']);
  if (narrowing.kind === 'error') {
    return { kind: 'error', reason: narrowing.reason };
  }

  const impact = raw['impact'];
  if (impact !== undefined && !isPlainObject(impact)) {
    return { kind: 'error', reason: 'impact must be an object' };
  }
  const godNodePercentile = parseGodNodePercentile(
    impact === undefined ? undefined : impact['godNodePercentile'],
  );
  if (typeof godNodePercentile === 'string') {
    return { kind: 'error', reason: godNodePercentile };
  }

  return {
    kind: 'ok',
    registry: {
      version: 1,
      roots,
      restricted,
      languages,
      operations,
      narrowing: narrowing.state,
      godNodePercentile,
    },
  };
}
