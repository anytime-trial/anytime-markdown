import { evaluateOddBoundary } from './oddBoundary';
import type {
  ApprovalEvaluation,
  ApprovalReason,
  ApprovalRequest,
  ApprovalVerdict,
  OddRegistry,
  OddResolution,
  OperationKind,
} from './types';
import { ALWAYS_HUMAN_OPERATIONS } from './types';

/**
 * リリース凍結中に allow を落とす種別。
 *
 * `code_change` を含めるのは、**`ALWAYS_HUMAN_OPERATIONS` によって `code_change`
 * 以外はもともと常に `confirm` になるため**である。含めないと `release_freeze` は
 * 観測可能な効果を持たない状態になる。リリースを切っている最中に自律編集が入る
 * のを止める、という凍結の目的にも合う。
 *
 * `incident` との違いは理由コード（`narrowed_release_freeze` / `narrowed_incident`）
 * に残る。判定結果は同じでも、なぜ止めたかは監査で区別できる必要がある。
 */
const FROZEN_BY_RELEASE_FREEZE: ReadonlySet<OperationKind> = new Set<OperationKind>([
  'code_change',
  'remote_push',
  'production_release',
  'dependency_change',
]);

function result(
  verdict: ApprovalVerdict,
  reasons: readonly ApprovalReason[],
  declaredVerdict: ApprovalVerdict | null,
  source: OddResolution['kind'],
): ApprovalEvaluation {
  return { verdict, reasons, declaredVerdict, source };
}

function narrowingReason(registry: OddRegistry, kind: OperationKind): ApprovalReason | null {
  if (registry.narrowing === 'release_freeze' && FROZEN_BY_RELEASE_FREEZE.has(kind)) {
    return 'narrowed_release_freeze';
  }
  if (registry.narrowing === 'incident') {
    return 'narrowed_incident';
  }
  return null;
}

/**
 * 操作種別ごとの承認判定 (管制塔要件 §3.2)。純粋関数で、ファイル I/O も
 * 中心性の算出も行わない。規則を上から評価し、最初に該当したものを理由にする。
 *
 * **未定義の操作種別は `allow` ではなく `confirm` へ倒す。** ロードマップの
 * fail-open 方針は「判定処理が失敗しても停止させない」ことであって、判定不能を
 * 許可へ倒すことではない。`confirm` は停止ではなく「人へ聞く」であり両立する。
 */
export function evaluateApprovalPolicy(
  resolution: OddResolution,
  request: ApprovalRequest,
): ApprovalEvaluation {
  if (resolution.kind === 'invalid') {
    // 壊れた設定を既定で埋めると「保護を足したつもりが構文エラーで無効化されていた」
    // 状態が黙って自律実行を許す
    return result('confirm', ['registry_invalid'], null, 'invalid');
  }
  const registry = resolution.registry;
  const source = resolution.kind;
  const declared = registry.operations[request.operationKind] ?? null;

  const boundary = evaluateOddBoundary(registry, request.targetPaths);
  if (boundary !== null) {
    return result('confirm', [boundary], declared, source);
  }
  if (registry.languages !== null) {
    // 言語制限が宣言されているのに対象言語が不明なら判定不能として confirm へ倒す。
    // 「省略できる入力を省くだけで言語 ODD が無効化される」経路を塞ぐ
    if (request.language === null) {
      return result('confirm', ['language_unknown'], declared, source);
    }
    if (!registry.languages.includes(request.language)) {
      return result('confirm', ['language_out_of_odd'], declared, source);
    }
  }
  const narrowed = narrowingReason(registry, request.operationKind);
  if (narrowed !== null) {
    return result('confirm', [narrowed], declared, source);
  }
  // ポリシーの宣言によらず必ず人へ聞く操作。カバレッジゲートと同じ集合を見る
  // （片方にしか無いと、機体がもう片方を信じたときに規約がバイパスされる）
  if (ALWAYS_HUMAN_OPERATIONS.has(request.operationKind)) {
    return result('confirm', ['always_human_operation'], declared, source);
  }
  if (request.isGodNode === true) {
    return result('confirm', ['god_node_impact'], declared, source);
  }

  // 中心性データの不在は抑止しない。設定の誤り (invalid) は自律を止める側へ倒すが、
  // データの不在は「保護がまだ存在しない」状態であり、止める側へ倒すと解析前の
  // ワークスペースで何もできなくなる。非対称は意図的なので理由コードで可視化する
  const unknownImpact: readonly ApprovalReason[] =
    request.isGodNode === null ? ['impact_unknown'] : [];

  if (declared === null) {
    return result('confirm', ['policy_unspecified', ...unknownImpact], null, source);
  }
  if (declared === 'deny') {
    return result('deny', ['policy_deny', ...unknownImpact], declared, source);
  }
  if (declared === 'confirm') {
    return result('confirm', ['policy_confirm', ...unknownImpact], declared, source);
  }
  return result('allow', ['policy_allow', ...unknownImpact], declared, source);
}
