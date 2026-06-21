import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import { mountReleasesPanel, type ReleasesPanelProps as VanillaProps } from '../views/releasesPanel';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';

export interface ReleasesPanelProps {
  readonly releases: readonly TrailRelease[];
}

export function ReleasesPanel({ releases }: Readonly<ReleasesPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const { commitColors } = useTrailTheme();

  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: VanillaProps = {
    releases,
    t: tStr,
    commitColors,
  };

  return <VanillaIsland mount={mountReleasesPanel} props={viewProps} />;
}
