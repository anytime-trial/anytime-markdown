import type { TrailSession } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import { mountSessionList, type SessionListProps } from '../views/sessionList';

interface SessionListComponentProps {
  readonly sessions: readonly TrailSession[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}

export function SessionList({ sessions, selectedId, onSelect }: Readonly<SessionListComponentProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();

  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: SessionListProps = {
    t: tStr,
    sessions,
    selectedId,
    onSelect,
    colors: {
      textSecondary: colors.textSecondary,
      iceBlue: colors.iceBlue,
    },
  };

  return <VanillaIsland mount={mountSessionList} props={viewProps} />;
}
