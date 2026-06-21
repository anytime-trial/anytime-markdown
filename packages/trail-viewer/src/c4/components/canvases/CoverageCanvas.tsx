/**
 * CoverageCanvas — thin React wrapper around the vanilla mountCoverageCanvas factory.
 *
 * All rendering and interaction logic lives in:
 *   packages/trail-viewer/src/views/c4/canvases/coverageCanvas.ts
 */
import type React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountCoverageCanvas } from '../../../views/c4/canvases/coverageCanvas';
import type { CoverageCanvasProps } from '../../../views/c4/canvases/coverageCanvas';

export function CoverageCanvas(props: Readonly<CoverageCanvasProps>): React.ReactElement {
  return <VanillaIsland mount={mountCoverageCanvas} props={props} />;
}
