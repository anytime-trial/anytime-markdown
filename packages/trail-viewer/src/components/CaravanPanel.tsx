import { useCallback } from 'react';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import {
  mountCaravanPanel,
  type CaravanPanelViewProps,
} from '../views/caravan/caravanPanel';

export interface CaravanPanelProps {
  readonly serverUrl: string;
}

export function CaravanPanel({ serverUrl }: Readonly<CaravanPanelProps>) {
  const { t } = useTrailI18n();
  const tokens = useTrailTheme();
  const { isDark } = tokens;

  const tStr = useCallback((key: string): string => t(key as Parameters<typeof t>[0]), [t]);

  const viewProps: CaravanPanelViewProps = {
    serverUrl,
    tokens,
    isDark,
    t: tStr,
  };

  return <VanillaIsland mount={mountCaravanPanel} props={viewProps} />;
}
