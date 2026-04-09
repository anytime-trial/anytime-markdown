import { createContext, useContext, useMemo } from 'react';

import type { TrailThemeTokens } from './designTokens';
import { getTokens } from './designTokens';

const TrailThemeContext = createContext<TrailThemeTokens>(getTokens(true));

export function TrailThemeProvider({
  isDark,
  children,
}: Readonly<{ isDark: boolean; children: React.ReactNode }>) {
  const tokens = useMemo(() => getTokens(isDark), [isDark]);
  return (
    <TrailThemeContext value={tokens}>
      {children}
    </TrailThemeContext>
  );
}

export function useTrailTheme(): TrailThemeTokens {
  return useContext(TrailThemeContext);
}
