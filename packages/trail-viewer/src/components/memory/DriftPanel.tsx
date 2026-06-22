import React from 'react';
import { useTrailI18n } from '../../i18n';
import type { MemoryDriftEventRow } from '../../data/types';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountDriftPanel, type DriftPanelProps as DriftPanelViewProps } from '../../views/memory/driftPanel';

export interface DriftPanelProps {
  readonly rows: readonly MemoryDriftEventRow[];
  readonly onResolve: (id: string, note: string) => Promise<void>;
  readonly onLoadDetail: (id: string) => Promise<unknown>;
}

export function DriftPanel({ rows, onResolve, onLoadDetail }: Readonly<DriftPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);

  const viewProps: DriftPanelViewProps = {
    t: tStr,
    rows,
    onResolve,
    onLoadDetail,
  };

  return <VanillaIsland mount={mountDriftPanel} props={viewProps} />;
}
