import type React from 'react';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { TrailSessionCommit, TrailTokenUsage } from '../../../domain/parser/types';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountSessionCommitList } from '../../../views/analytics/panels/sessionCommitList';

export function SessionCommitList({
  sessionId,
  usage,
  fetchSessionCommits,
}: Readonly<{
  sessionId: string;
  usage: TrailTokenUsage;
  fetchSessionCommits: (id: string) => Promise<readonly TrailSessionCommit[]>;
}>): React.ReactElement {
  const { colors, cardSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);
  return (
    <VanillaIsland
      mount={mountSessionCommitList}
      props={{
        sessionId,
        usage,
        fetchSessionCommits,
        colors: {
          border: colors.border,
          textSecondary: colors.textSecondary,
          midnightNavy: colors.midnightNavy,
        },
        cardSx,
        t: tStr,
      }}
    />
  );
}
