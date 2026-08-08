/**
 * ADR (Agentic AI Detection and Response) 由来の脅威検知型。
 * 出典: https://github.com/uber/ADR (Apache License 2.0) / arXiv:2605.17380。
 * id・分類は原典を保持し、外部フレームワークとの照合可能性を優先する。
 */

export const THREAT_TACTIC_IDS = [
  'initial_compromise',
  'permission_abuse',
  'security_control_bypass',
  'reasoning_data_manipulation',
  'operational_impact',
] as const;

export type ThreatTacticId = (typeof THREAT_TACTIC_IDS)[number];

export interface ThreatTechnique {
  /** 原典 ADR の技法 id（例: ADR.T0002）。改番しない */
  readonly id: string;
  readonly name: string;
  readonly jaName: string;
  readonly description: string;
  readonly tactic: ThreatTacticId;
}

export interface ThreatTactic {
  readonly id: ThreatTacticId;
  readonly name: string;
  readonly jaName: string;
  readonly description: string;
  readonly techniques: readonly ThreatTechnique[];
}

export interface ThreatFramework {
  readonly tactics: readonly ThreatTactic[];
}

/** Tier 1 triage の判定。パース不能・曖昧応答は isSuspicious=true へ倒す（fail-closed） */
export interface TriageVerdict {
  readonly kind: 'triage';
  readonly isSuspicious: boolean;
  readonly tactic: ThreatTacticId | null;
  /** 0.0-1.0 */
  readonly confidence: number;
  readonly reason: string;
}

/** Tier 2 reasoning の判定（原典の JSON 出力契約 is_threat/confidence/explanation に対応） */
export interface DetectionVerdict {
  readonly kind: 'detection';
  readonly isThreat: boolean;
  /** 0.0-1.0 */
  readonly confidence: number;
  readonly explanation: string;
}

/**
 * Tier 2 応答のパース結果。unparseable を throw にしないのは、呼び出し側が
 * refusal 検知 → retry プロンプトへ分岐する制御を持つため（原典の設計を踏襲）。
 */
export type DetectionParseResult =
  | { readonly kind: 'parsed'; readonly verdict: DetectionVerdict }
  | { readonly kind: 'unparseable'; readonly reason: string };
