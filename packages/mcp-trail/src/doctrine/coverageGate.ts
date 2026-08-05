import * as path from 'node:path';
import type { OddRegistry, OddResolution, OperationKind } from '@anytime-markdown/trail-core';
import type { CitationApproval } from './resolveCitations';

export type { OperationKind };

export type GateVerdict = 'delegable' | 'escalate';

export type GateReason =
  | 'odd_registry_invalid'
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

/**
 * ゲートの判定によらず必ず人へ聞く操作種別。global `CLAUDE.md`「承認の対象」が
 * 都度承認を要求する例外項目と対応する。
 */
const ALWAYS_HUMAN: ReadonlySet<OperationKind> = new Set<OperationKind>([
  'dependency_change',
  'destructive_git',
  'remote_push',
  'production_release',
  'persistent_data_write',
]);

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
}

export interface CoverageGateResult {
  readonly verdict: GateVerdict;
  /** 該当した規則の理由コード（delegable のときは空） */
  readonly reasons: readonly GateReason[];
}

function escalate(reason: GateReason): CoverageGateResult {
  return { verdict: 'escalate', reasons: [reason] };
}

function isWithin(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * ODD 境界の判定 (DCT-12)。制限領域は ODD 内であっても代行対象外のため、
 * 対象リポジトリ内かどうかより先に判定する。
 */
function evaluateOdd(
  targetPaths: ReadonlyArray<string> | undefined,
  odd: OddRegistry,
): GateReason | null {
  // 空文字列は path.resolve で cwd (＝ワークスペース内) へ解決してしまい ODD 判定を
  // すり抜けるため、申告の欠落として扱う
  if (
    targetPaths === undefined ||
    targetPaths.length === 0 ||
    targetPaths.some((target) => target.trim() === '')
  ) {
    return 'odd_unknown';
  }
  // 前方一致の前に正規化する。`..` を含むパスをそのまま比較すると境界をすり抜ける
  const normalized = targetPaths.map((target) => path.resolve(target));
  if (
    normalized.some((target) =>
      odd.restricted.some((entry) =>
        entry.kind === 'prefix' ? isWithin(target, entry.value) : target.includes(entry.value),
      ),
    )
  ) {
    return 'restricted_area';
  }
  if (normalized.some((target) => !odd.roots.some((root) => isWithin(target, root)))) {
    return 'odd_out';
  }
  return null;
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
  const oddReason = evaluateOdd(input.targetPaths, input.odd.registry);
  if (oddReason !== null) {
    return escalate(oddReason);
  }
  // 操作種別はパスに現れない軸なので、targetPaths の判定を通っても別途評価する。
  // ここを「申告が無ければ素通り」にすると、push・リリース・破壊的 git が
  // 「判定していない＝代行可」として通る (この軸だけ fail-open になる)
  if (input.operationKind === undefined) {
    return escalate('operation_kind_unknown');
  }
  if (ALWAYS_HUMAN.has(input.operationKind)) {
    return escalate('always_human_operation');
  }
  if (input.severity === undefined) {
    return escalate('severity_unknown');
  }
  if (input.severity === 'high') {
    return escalate('severity_high');
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
