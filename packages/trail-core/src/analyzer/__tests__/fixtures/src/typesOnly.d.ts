// Pure type declaration file used to verify ProjectAnalyzer excludes .d.ts
// from getSourceFiles().
export interface DeclarationOnly {
  readonly id: string;
  readonly value: number;
}

export type DeclarationOnlyAlias = DeclarationOnly;
