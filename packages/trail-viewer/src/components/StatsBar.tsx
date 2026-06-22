import type { TrailMessage, TrailSession } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import { mountStatsBar, type StatsBarProps } from '../views/statsBar';

interface StatsBarComponentProps {
  readonly session?: TrailSession;
  readonly messages: readonly TrailMessage[];
}

export function StatsBar({ session, messages }: Readonly<StatsBarComponentProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();

  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: StatsBarProps = {
    t: tStr,
    session,
    messages,
    colors: {
      border: colors.border,
      charcoal: colors.charcoal,
      textSecondary: colors.textSecondary,
      iceBlue: colors.iceBlue,
      error: colors.error,
      success: colors.success,
    },
  };

  return <VanillaIsland mount={mountStatsBar} props={viewProps} />;
}
