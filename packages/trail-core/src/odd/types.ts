/**
 * ODD (Operational Design Domain) Policy Registry と承認ルールの型
 * (Phase 7-A。管制塔要件 §3.1 / §3.2)。
 *
 * 本モジュールは純粋な型と判定だけを持ち、ファイル I/O を含まない。読み込みは
 * 呼び出し側 (mcp-trail / 拡張) が行い、内容を文字列として渡す。
 */

/**
 * 操作種別。**パスに現れない操作** (push・リリース・破壊的 git) は変更対象パスでは
 * 原理的に表現できないため、呼び出し側が別軸で申告する。
 */
export type OperationKind =
  | 'code_change'
  | 'dependency_change'
  | 'destructive_git'
  | 'remote_push'
  | 'production_release'
  | 'persistent_data_write';

export const OPERATION_KINDS: readonly OperationKind[] = [
  'code_change',
  'dependency_change',
  'destructive_git',
  'remote_push',
  'production_release',
  'persistent_data_write',
];

export type ApprovalVerdict = 'allow' | 'confirm' | 'deny';

/** 動的 ODD 縮小の状態。自動判定はしない (人または上位機構が宣言する) */
export type NarrowingState = 'normal' | 'release_freeze' | 'incident';

/** 制限領域の指定。絶対パス前置と、パス断片の 2 通りを判別子で分ける */
export type RestrictedEntry =
  | { readonly kind: 'prefix'; readonly value: string; readonly note?: string }
  | { readonly kind: 'pattern'; readonly value: string; readonly note?: string };

export interface OddRegistry {
  readonly version: 1;
  /** 自律運航が許容される対象リポジトリのルート (絶対パス) */
  readonly roots: readonly string[];
  /** ODD 内でも代行対象外の領域 */
  readonly restricted: readonly RestrictedEntry[];
  /**
   * 自律運航が許容される言語。**空配列は「制限しない」ではなく「許容言語なし」**。
   * 未指定 (null) が「制限しない」。書き忘れが黙って全許可になるのを避けるため区別する。
   */
  readonly languages: readonly string[] | null;
  /** 操作種別ごとの承認ポリシー。書かれていない種別は confirm (§4.2 規則 8) */
  readonly operations: Readonly<Partial<Record<OperationKind, ApprovalVerdict>>>;
  readonly narrowing: NarrowingState;
  /** 影響度ベース承認の閾値 (中心性スコアの上位パーセンタイル) */
  readonly godNodePercentile: number;
}

/**
 * ODD 定義の解決結果。
 *
 * **「ファイルが無い」と「ファイルが壊れている」を同じに扱わない。** 前者は
 * レジストリ未導入で既定へ縮退してよいが、後者を既定で埋めると「制限領域を
 * 足したつもりが構文エラーで無効化されていた」状態が黙って自律実行を許す。
 */
export type OddResolution =
  | { readonly kind: 'registry'; readonly registry: OddRegistry }
  | { readonly kind: 'derived'; readonly registry: OddRegistry }
  | { readonly kind: 'invalid'; readonly reason: string };

export type ApprovalReason =
  | 'registry_invalid'
  | 'odd_unknown'
  | 'odd_out'
  | 'restricted_area'
  | 'language_out_of_odd'
  | 'narrowed_release_freeze'
  | 'narrowed_incident'
  | 'god_node_impact'
  | 'impact_unknown'
  | 'policy_deny'
  | 'policy_confirm'
  | 'policy_allow'
  | 'policy_unspecified';

export interface ApprovalEvaluation {
  readonly verdict: ApprovalVerdict;
  readonly reasons: readonly ApprovalReason[];
  /** operations に書かれていた判定。上位規則で上書きされた場合も宣言を残す */
  readonly declaredVerdict: ApprovalVerdict | null;
  readonly source: OddResolution['kind'];
}

export interface ApprovalRequest {
  readonly operationKind: OperationKind;
  /** 影響する変更対象 (絶対パス)。空・未指定は ODD 判定不能 */
  readonly targetPaths: readonly string[];
  /** 対象言語。未指定 (null) は言語判定を行わない */
  readonly language: string | null;
  /**
   * 対象が God Node かどうか。**null は「中心性データが無い」**（未解析）で、
   * false（データはあるが God Node ではない）と区別する。
   */
  readonly isGodNode: boolean | null;
}
