import { useTrailTheme } from '../../../TrailThemeContext';
import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountLeadTimeOverlay } from '../../../../views/analytics/charts/combined/leadTimeOverlay';

export function LeadTimeOverlay({
  leadTimeOverlay,
  canDrill,
  onDateClick,
}: Readonly<{
  leadTimeOverlay: {
    leadTimePerLoc: ReadonlyArray<{ bucketStart: string; value: number }>;
    unmapped: ReadonlyArray<{ bucketStart: string; value: number }>;
    byPrefix: {
      prefixes: ReadonlyArray<string>;
      series: ReadonlyArray<{ bucketStart: string; byPrefix: Readonly<Record<string, number>> }>;
    };
  } | null;
  canDrill: boolean;
  onDateClick?: (date: string) => void;
}>) {
  const { cardSx, toolPalette, isDark } = useTrailTheme();

  return (
    <VanillaIsland
      mount={mountLeadTimeOverlay}
      props={{ leadTimeOverlay, canDrill, onDateClick, isDark, toolPalette, cardSx }}
    />
  );
}
