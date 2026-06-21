/**
 * GalaxyCanvas — thin React wrapper around the vanilla mountGalaxyCanvas factory.
 *
 * All rendering and interaction logic lives in:
 *   packages/trail-viewer/src/views/c4/canvas/galaxyCanvas.ts
 */
import type React from 'react';
import { useTrailTheme } from '../../components/TrailThemeContext';
import { VanillaIsland } from '../../shared/vanillaIsland';
import type { GalaxyCanvasViewProps } from '../../views/c4/canvas/galaxyCanvas';
import { mountGalaxyCanvas } from '../../views/c4/canvas/galaxyCanvas';

export type { GalaxyCanvasViewProps as GalaxyCanvasProps } from '../../views/c4/canvas/galaxyCanvas';

export function GalaxyCanvas({
  entries,
  onFunctionOpen,
  height = 400,
}: Readonly<GalaxyCanvasViewProps>): React.ReactElement {
  const { isDark } = useTrailTheme();

  const vanillaProps: GalaxyCanvasViewProps = {
    entries,
    onFunctionOpen,
    height,
    isDark,
  };

  return <VanillaIsland mount={mountGalaxyCanvas} props={vanillaProps} />;
}
