/**
 * C4ViewerCore — thin React wrapper (refactor/trail-viewer-vanilla).
 *
 * Resolves React-land hooks (useTrailI18n) then delegates all rendering
 * to the vanilla `mountC4Viewer` via VanillaIsland.
 */
import { useCallback } from 'react';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountC4Viewer } from '../../views/c4/c4Viewer';
import type { C4ViewerViewProps } from '../../views/c4/c4Viewer';
import type { C4ViewerCoreProps } from './types';

export type { C4ViewerCoreProps };

export function C4ViewerCore(props: Readonly<C4ViewerCoreProps>): React.ReactElement {
  const { t } = useTrailI18n();

  const viewProps: C4ViewerViewProps = {
    ...props,
    t: t as (key: string) => string,
  };

  // Keep mount stable — VanillaIsland calls mount once and update() on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mount = useCallback(mountC4Viewer, []);

  return <VanillaIsland mount={mount} props={viewProps} />;
}
