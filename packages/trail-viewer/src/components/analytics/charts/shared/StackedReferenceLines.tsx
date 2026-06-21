import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountStackedReferenceLines } from '../../../../views/analytics/charts/shared/stackedReferenceLines';

export function StackedReferenceLines({
  commitTurns,
  errorTurns,
  totalTurns,
}: Readonly<{
  commitTurns: readonly number[];
  errorTurns: readonly number[];
  totalTurns: number;
}>) {
  return (
    <VanillaIsland
      mount={mountStackedReferenceLines}
      props={{ commitTurns, errorTurns, totalTurns }}
    />
  );
}
