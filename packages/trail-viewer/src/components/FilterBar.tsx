import { useMemo } from 'react';
import type { TrailFilter, TrailSession } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import { mountFilterBar, type FilterBarProps } from '../views/filterBar';

interface FilterBarComponentProps {
  readonly filter: TrailFilter;
  readonly sessions: readonly TrailSession[];
  readonly onChange: (filter: TrailFilter) => void;
}

export function FilterBar({ filter, sessions, onChange }: Readonly<FilterBarComponentProps>) {
  const { t } = useTrailI18n();
  const { colors } = useTrailTheme();

  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: FilterBarProps = useMemo(
    () => ({
      t: tStr,
      filter,
      sessions,
      onChange,
      colors: {
        midnightNavy: colors.midnightNavy,
        border: colors.border,
        textSecondary: colors.textSecondary,
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, sessions, onChange, colors],
  );

  return <VanillaIsland mount={mountFilterBar} props={viewProps} />;
}
