import { useCallback } from 'react';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { useChatBridge } from '../hooks/useChatBridge';
import { VanillaIsland } from '../shared/vanillaIsland';
import {
  mountMemoryPanel,
  type MemoryPanelViewProps,
} from '../views/memory/memoryPanel';

export interface MemoryPanelProps {
  readonly serverUrl: string;
  readonly onOpenSessionMessages?: (sessionId: string) => void;
}

export function MemoryPanel({ serverUrl, onOpenSessionMessages }: Readonly<MemoryPanelProps>) {
  const { t } = useTrailI18n();
  const tokens = useTrailTheme();
  const { isDark } = tokens;
  const bridge = useChatBridge(serverUrl);

  const tStr = useCallback((key: string): string => t(key as Parameters<typeof t>[0]), [t]);

  const viewProps: MemoryPanelViewProps = {
    serverUrl,
    tokens,
    isDark,
    t: tStr,
    bridge,
    onOpenSessionMessages,
  };

  return <VanillaIsland mount={mountMemoryPanel} props={viewProps} />;
}
