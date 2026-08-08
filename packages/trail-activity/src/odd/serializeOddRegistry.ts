import type {
  ApprovalVerdict,
  NarrowingState,
  OddRegistry,
  OperationKind,
  RestrictedEntry,
} from './types';

/**
 * `odd.json` のファイル形式。`OddRegistry`（解決済みの内部形）とは意図的に形が違う。
 *
 * - `narrowing` はファイル側がオブジェクト（`{"state":"normal"}`）、内部形は文字列
 * - `godNodePercentile` はファイル側が `impact` の下、内部形はフラット
 *
 * 内部形をそのまま `odd.json` として書くと、前者は `invalid` になり（§3.3 の方針どおり
 * 既定へ縮退しないので全判断が `escalate` に倒れる）、後者は**黙って既定値へ戻る**。
 * 出力を雛形として使う経路を塞ぐため、書き出しは必ず本型を経由する。
 */
export interface OddRegistryFile {
  readonly version: 1;
  readonly roots: readonly string[];
  readonly restricted: readonly RestrictedEntry[];
  /** `null`（制限しない）のときはキーごと省く。`null` を書くと parse が落ちるため */
  readonly languages?: readonly string[];
  readonly operations: Readonly<Partial<Record<OperationKind, ApprovalVerdict>>>;
  readonly narrowing: { readonly state: NarrowingState };
  readonly impact: { readonly godNodePercentile: number };
}

function serializeRestrictedEntry(entry: RestrictedEntry): RestrictedEntry {
  // `note: undefined` を生やさない。JSON.stringify では消えるが、オブジェクトのまま
  // 比較する呼び出し側（テスト・差分表示）で「無い」と「未定義」が食い違う
  return entry.note === undefined
    ? { kind: entry.kind, value: entry.value }
    : { kind: entry.kind, value: entry.value, note: entry.note };
}

/**
 * 解決済みの `OddRegistry` を `odd.json` のファイル形式へ書き戻す。
 *
 * `parseOddRegistry(JSON.stringify(serializeOddRegistry(r)))` が `r` に戻ることが
 * 本関数の仕様であり、ユニットテストで往復の恒等性として固定している。
 */
export function serializeOddRegistry(registry: OddRegistry): OddRegistryFile {
  const {
    version,
    roots,
    restricted,
    languages,
    operations,
    narrowing,
    godNodePercentile,
    ..._unhandled
  } = registry;

  // `OddRegistry` にフィールドが増えたとき、本関数の追従漏れを型エラーで知らせる。
  // 拾い切れていないキーが残ると残余が空オブジェクトでなくなり、この代入が落ちる。
  // 追従漏れは「パーサは受理するのに serializer は出さない」非対称そのもの——本関数が
  // 塞いだ欠陥の再発なので、テストの更新忘れに依存せず型で止める。
  const _exhaustive: Record<string, never> = _unhandled;
  void _exhaustive;

  const base = {
    version,
    roots: [...roots],
    restricted: restricted.map(serializeRestrictedEntry),
    operations: { ...operations },
    narrowing: { state: narrowing },
    impact: { godNodePercentile },
  } satisfies Omit<OddRegistryFile, 'languages'>;

  if (languages === null) {
    return base;
  }
  return { ...base, languages: [...languages] };
}
