/**
 * CodeCityCanvas — thin React wrapper around the vanilla mountCodeCityCanvas factory.
 *
 * All rendering and interaction logic lives in:
 *   packages/trail-viewer/src/views/c4/canvas/codeCityCanvas.ts
 */
import type React from 'react';
import { useTrailTheme } from '../../components/TrailThemeContext';
import { VanillaIsland } from '../../shared/vanillaIsland';
import type { CodeCityCanvasViewProps } from '../../views/c4/canvas/codeCityCanvas';
import { mountCodeCityCanvas } from '../../views/c4/canvas/codeCityCanvas';

export type { CodeCityCanvasViewProps as CodeCityCanvasProps } from '../../views/c4/canvas/codeCityCanvas';

export function CodeCityCanvas({
  entries,
  onFunctionOpen,
  height = 400,
}: Readonly<CodeCityCanvasViewProps>): React.ReactElement {
  const { isDark } = useTrailTheme();

  const vanillaProps: CodeCityCanvasViewProps = {
    entries,
    onFunctionOpen,
    height,
    isDark,
  };

  return <VanillaIsland mount={mountCodeCityCanvas} props={vanillaProps} />;
}
