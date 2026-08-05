// Flight Record: 「指示（instruction）」単位の運航記録のドメイン型。
// DDL は domain/schema/tables.ts の CREATE_INSTRUCTIONS / CREATE_INSTRUCTION_SESSIONS が正本。
//
// 指示は人が出した 1 つの作業依頼で、1 指示は複数セッションにまたがりうる。
// 対応付けは推測せず、エージェントの明示宣言（MCP record_instruction）だけが作る
// （継続表現の正規表現による自動判定は「進めて」で始まる新規指示と区別できず、
//  外した判定を人が直せないため採らない）。

import type { FlightOutcome, FlightOutcomeSource } from './flightReview';

/** 指示の台帳 1 行。 */
export interface Instruction {
  /** 指示 ID（UUID）。行の identity で、セッション ID とは独立。 */
  id: string;
  workspacePath: string;
  /** 一覧に出す短い名前。workspacePath の末尾セグメント相当だが、宣言側が明示する。 */
  workspaceName: string;
  /** 起点指示の概要（宣言側が書く 1 行）。 */
  summary: string;
  /** 起点となった人のプロンプト（切詰め済み）。 */
  originPrompt: string;
  /** 起点セッション ID。 */
  originSessionId: string;
  /** UTC ISO 8601 */
  startedAt: string;
  /** 完了宣言の時刻。null は進行中（継続宣言の候補に出る）。 */
  closedAt: string | null;
  /** UTC ISO 8601 */
  createdAt: string;
  /** UTC ISO 8601 */
  updatedAt: string;
}

/** 指示 : セッションの対応 1 行。1 セッションは 1 指示にしか属さない。 */
export interface InstructionSession {
  instructionId: string;
  sessionId: string;
  /** その指示の中で何番目のセッションか（1 起点）。 */
  sequence: number;
  /** UTC ISO 8601 */
  declaredAt: string;
}

/** 指示の新規登録入力（record_instruction の new モード）。 */
export interface InstructionOpenInput {
  id: string;
  sessionId: string;
  workspacePath: string;
  workspaceName: string;
  summary: string;
  originPrompt: string;
  /** UTC ISO 8601。省略時は呼び出し側が現在時刻を与える。 */
  startedAt: string;
}

/** 既存指示への継続宣言入力（record_instruction の continue モード）。 */
export interface InstructionContinueInput {
  instructionId: string;
  sessionId: string;
  /** UTC ISO 8601 */
  declaredAt: string;
  /**
   * 宣言側のワークスペース。指定すると対象指示のワークスペースと突合し、
   * 不一致なら拒否する。別ワークスペースの指示 ID を渡せてしまうと、そのセッションの
   * 時間・トークン・コミットが別ワークスペースの行へ合算され、しかも一覧の
   * ワークスペース絞り込みは指示側の値で判定するため混入行を落とせない。
   */
  workspacePath?: string;
}

/** 成果物の種別。ドキュメントは未コミットを含み、コードはコミット済みのみ。 */
export type DeliverableKind = 'doc' | 'code';

/**
 * 成果物 1 件。
 * `committed=false` はドキュメントにのみ現れる（コードはコミット済みのみを採るため）。
 */
export interface InstructionDeliverable {
  kind: DeliverableKind;
  filePath: string;
  committed: boolean;
  /** committed=true のときの短縮コミットハッシュ（複数あれば最新 1 件）。未コミットは空文字。 */
  commitHash: string;
}

/** 検証コマンドの種別。スキーマ側の CHECK 制約（CREATE_VERIFICATION_RUNS）と対の定義。 */
export const VERIFICATION_KINDS = ['unit', 'build', 'next-build', 'typecheck', 'lint', 'e2e', 'manual'] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export type VerificationRunStatus = 'pass' | 'fail' | 'error';

/**
 * 指示に属する検証コマンドの実行 1 件（kind ごとに最新 1 件へ畳んだもの）。
 * `codeStateHash` が null の実行は dirty なツリーでの実行で、「このコミットで検証済み」の
 * 根拠にはならない（表示はするが実施済み判定には使わない）。
 */
export interface InstructionVerificationRun {
  kind: VerificationKind;
  package: string;
  command: string;
  status: VerificationRunStatus;
  durationMs: number;
  commitHash: string;
  treeState: 'clean' | 'dirty';
  codeStateHash: string | null;
  startedAt: string;
}

/** モデル別のトークン内訳（session_costs をモデルで畳んだもの）。 */
export interface InstructionTokenUsageByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
}

/** 指示のトークン消費。`imported=false` は session_costs 未取込（0 件と区別する）。 */
export interface InstructionTokenUsage {
  imported: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  byModel: InstructionTokenUsageByModel[];
}

/**
 * 一覧の 1 行。所属セッションの flight_reviews を畳んで導出する
 * （導出は AssembleInstructionRecord の純粋関数が正本）。
 */
export interface InstructionRecord {
  instructionId: string;
  workspacePath: string;
  workspaceName: string;
  summary: string;
  originPrompt: string;
  /** 所属セッションの startedAt 最小。すべて null なら endedAt 最小へ縮退する。 */
  startedAt: string | null;
  /** 所属セッションの endedAt 最大。 */
  endedAt: string | null;
  /** 実働の合計秒。空白時間を含めないため startedAt〜endedAt の差ではない。 */
  durationSeconds: number | null;
  outcome: FlightOutcome;
  outcomeSource: FlightOutcomeSource;
  sessionCount: number;
  toolCallCount: number;
  toolFailureCount: number;
  reworkCount: number;
  /** 所属セッションのタグの和集合。 */
  tags: string[];
  closedAt: string | null;
  tokenUsage: InstructionTokenUsage;
  deliverables: InstructionDeliverable[];
  /** 所属セッションが実行した検証コマンド（kind ごとに最新 1 件）。 */
  verifications: InstructionVerificationRun[];
}

export interface InstructionRecordFilter {
  outcome?: FlightOutcome;
  /** UTC ISO 8601。endedAt がこれ以降。 */
  since?: string;
  /** UTC ISO 8601。endedAt がこれ以前。 */
  until?: string;
  tag?: string;
  workspacePath?: string;
  limit?: number;
}
