import { useCallback } from 'react';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import {
  mountMemoryPanel,
  type MemoryPanelViewProps,
} from '../views/memory/memoryPanel';

export interface MemoryPanelProps {
  readonly serverUrl: string;
}

export function MemoryPanel({ serverUrl }: Readonly<MemoryPanelProps>) {
  const { t } = useTrailI18n();
  const tokens = useTrailTheme();
  const { isDark } = tokens;

  const tStr = useCallback((key: string): string => t(key as Parameters<typeof t>[0]), [t]);

  const viewProps: MemoryPanelViewProps = {
    serverUrl,
    tokens,
    isDark,
    t: tStr,
  };

  return <VanillaIsland mount={mountMemoryPanel} props={viewProps} />;
}
