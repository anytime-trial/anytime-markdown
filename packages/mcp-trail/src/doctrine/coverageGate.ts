import type { OddResolution, OperationKind } from '@anytime-markdown/trail-activity';
import { ALWAYS_HUMAN_OPERATIONS, evaluateOddBoundary } from '@anytime-markdown/trail-activity';

import type { CitationApproval } from './resolveCitations';

export type { OperationKind };

export type GateVerdict = 'delegable' | 'escalate';

export type GateReason =
  | 'odd_registry_invalid'
  | 'underspecified_unknown'
  | 'underspecified_instruction'
  | 'odd_unknown'
  | 'odd_out'
  | 'restricted_area'
  | 'operation_kind_unknown'
  | 'always_human_operation'
  | 'severity_unknown'
  | 'severity_high'
  | 'doctrine_conflict'
  | 'doctrine_silent'
  | 'no_canon_citation';

export type GateCoverage = 'covered' | 'silent' | 'conflict' | 'odd_out';
export type GateSeverity = 'low' | 'medium' | 'high';


export interface GateCitation {
  readonly resolved: boolean;
  readonly approval: CitationApproval;
}

export interface CoverageGateInput {
  readonly coverage: GateCoverage;
  readonly citations: ReadonlyArray<GateCitation>;
  /** 判断が影響する変更対象（絶対パス）。未指定は ODD 判定不能として escalate */
  readonly targetPaths?: ReadonlyArray<string> | undefined;
  /** 呼び出し側の重大度申告。未指定は判定不能として escalate */
  readonly severity?: GateSeverity | undefined;
  /** 呼び出し側の操作種別申告。未指定は判定不能として escalate */
  readonly operationKind?: OperationKind | undefined;
  /** ODD Policy Registry の解決結果（Phase 7-A）。`invalid` は判定不能として escalate */
  readonly odd: OddResolution;
  /**
   * 指示から一意に定まらない論点の事前申告 (DCT-14)。非空は escalate。
   * **未指定は判定不能として escalate**（他 3 軸と同じ fail-closed）。空配列を
   * 明示して初めて「指示から一意に定まる」という宣言になる。
   */
  readonly underspecifiedPoints?: ReadonlyArray<string> | undefined;
  /**
   * 解消済み論点の逐語文字列集合 (DCT-19)。`resolve_underspecified_points` で人の回答が
   * 記録された論点。申告との突合は逐語一致で、未解消の残りだけが規則 2.5 の対象になる。
   * 未指定は「解消なし」と同義（申告義務の fail-closed は underspecifiedPoints 側が担う）。
   */
  readonly resolvedPoints?: ReadonlyArray<string> | undefined;
}

export interface CoverageGateResult {
  readonly verdict: GateVerdict;
  /** 該当した規則の理由コード（delegable のときは空） */
  readonly reasons: readonly GateReason[];
}

function escalate(reason: GateReason): CoverageGateResult {
  return { verdict: 'escalate', reasons: [reason] };
}

function hasCanonGrounding(citations: ReadonlyArray<GateCitation>): boolean {
  // 未解決 (幻覚) の引用は承認状態を論じないため canon 接地として数えない
  return citations.some(
    (citation) =>
      citation.resolved &&
      (citation.approval === 'canon' || citation.approval === 'canon_by_document'),
  );
}

/**
 * 代行可否のカバレッジゲート (DCT-10 / DCT-11 / DCT-12)。規則を上から評価し、
 * 最初に該当したものを理由として escalate する。
 *
 * **判定不能はすべて escalate へ倒す (fail-closed)**。ゲートの誤りのうち回復不能
 * なのは「代行してはならない判断を代行可能と判定する」方向だけで、その逆は人の
 * 承認が 1 回増えるだけで済む (仕様 §2)。
 *
 * D1 の段階では判定結果を記録・集計するのみで、承認フローは変更しない。
 */
export function evaluateCoverageGate(input: CoverageGateInput): CoverageGateResult {
  if (input.odd.kind === 'invalid') {
    // 壊れたレジストリを既定へ縮退させると、「制限領域を足したつもりが構文エラーで
    // 無効化されていた」状態が黙って代行を許す (Phase 7-A 仕様 §3.3)
    return escalate('odd_registry_invalid');
  }
  const oddReason = evaluateOddBoundary(input.odd.registry, input.targetPaths);
  if (oddReason !== null) {
    return escalate(oddReason);
  }
  // 操作種別はパスに現れない軸なので、targetPaths の判定を通っても別途評価する。
  // ここを「申告が無ければ素通り」にすると、push・リリース・破壊的 git が
  // 「判定していない＝代行可」として通る (この軸だけ fail-open になる)
  if (input.operationKind === undefined) {
    return escalate('operation_kind_unknown');
  }
  if (ALWAYS_HUMAN_OPERATIONS.has(input.operationKind)) {
    return escalate('always_human_operation');
  }
  if (input.severity === undefined) {
    return escalate('severity_unknown');
  }
  if (input.severity === 'high') {
    return escalate('severity_high');
  }
  // DCT-14: ここまでの規則は「指示を明確化しても代行できない」絶対軸 (ODD 外・制限領域・
  // 常に人へ聞く操作・高重大度) であり、それらを先に評価しないと理由コードから消える
  // (verdict は同じ escalate でも、事後分析で「push だから人へ聞いた」事実が失われる)。
  // 未確定論点は「明確化すれば代行できる」側なので、絶対軸の後・ドクトリン接地の前に置く。
  if (input.underspecifiedPoints === undefined) {
    // 他 3 軸と同じ fail-closed。省略を空扱いにすると、この軸だけ「言及しなかった」が
    // 「一意に定まると宣言した」に化け、嘘をつかずにゲートを素通りできてしまう
    return escalate('underspecified_unknown');
  }
  // DCT-19: 人の回答が記録された論点は解消済みとして除き、未解消の残りだけで判定する。
  // 申告列（underspecifiedPoints）自体は書き換えない — 解消は別テーブルの加算のみで
  // 表現し、「論点が無かった」状態にはならない（ラチェットと監査可能性の維持）
  const resolved = new Set(input.resolvedPoints ?? []);
  if (input.underspecifiedPoints.some((point) => !resolved.has(point))) {
    return escalate('underspecified_instruction');
  }
  if (input.coverage === 'conflict') {
    return escalate('doctrine_conflict');
  }
  if (input.coverage === 'silent') {
    return escalate('doctrine_silent');
  }
  if (input.coverage === 'odd_out') {
    return escalate('odd_out');
  }
  if (!hasCanonGrounding(input.citations)) {
    return escalate('no_canon_citation');
  }
  return { verdict: 'delegable', reasons: [] };
}
