/**
 * DsmCanvas — thin React wrapper around the vanilla mountDsmCanvas factory.
 *
 * All rendering and interaction logic lives in:
 *   packages/trail-viewer/src/views/c4/canvases/dsmCanvas.ts
 */
import type React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountDsmCanvas } from '../../../views/c4/canvases/dsmCanvas';
import type { DsmCanvasProps } from '../../../views/c4/canvases/dsmCanvas';

export function DsmCanvas(props: Readonly<DsmCanvasProps>): React.ReactElement {
  return <VanillaIsland mount={mountDsmCanvas} props={props} />;
}
