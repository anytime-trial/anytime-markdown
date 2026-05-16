export interface ReleaseStepDisplayInput {
  readonly linesAdded: number;
  readonly linesDeleted: number;
}

export interface ReleaseStepDisplay {
  readonly total: string;
  readonly breakdown: string;
}

export function formatReleaseStepDisplay({
  linesAdded,
  linesDeleted,
}: ReleaseStepDisplayInput): ReleaseStepDisplay {
  const fmt = (n: number): string => n.toLocaleString();
  return {
    total: fmt(linesAdded + linesDeleted),
    breakdown: `(+${fmt(linesAdded)}/-${fmt(linesDeleted)})`,
  };
}
