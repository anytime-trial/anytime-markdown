import type React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type {
  ToolMetrics,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountDailySessionList } from '../../../views/analytics/panels/dailySessionList';

export function DailySessionList({
  date,
  sessions,
  sessionsLoading,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
}: Readonly<{
  date: string;
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
}>): React.ReactElement {
  const { colors, chartColors, cardSx, isDark } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountDailySessionList}
      props={{
        date,
        sessions,
        sessionsLoading,
        onSelectSession,
        onJumpToTrace,
        fetchSessionMessages,
        fetchSessionCommits,
        fetchSessionToolMetrics,
        fetchDayToolMetrics,
        colors,
        chartColors,
        cardSx,
        isDark,
        t: tStr,
      }}
    />
  );
}
