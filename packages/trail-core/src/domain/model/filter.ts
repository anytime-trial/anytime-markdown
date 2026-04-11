// domain/model/filter.ts — Trail filter domain type

export interface TrailFilter {
  readonly project?: string;
  readonly gitBranch?: string;
  readonly model?: string;
  readonly dateRange?: Readonly<{ from: string; to: string }>;
  readonly toolName?: string;
  readonly searchText?: string;
}
