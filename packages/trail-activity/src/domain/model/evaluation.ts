// domain/model/evaluation.ts — Trail prompt & evaluation domain types

export interface TrailPromptEntry {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly version: number;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TrailEvaluation {
  readonly id: string;
  readonly sessionId: string;
  readonly score: number;
  readonly comment: string;
  readonly evaluator: string;
  readonly createdAt: string;
}
