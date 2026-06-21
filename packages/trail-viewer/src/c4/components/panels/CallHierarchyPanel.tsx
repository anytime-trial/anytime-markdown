import * as React from 'react';
import { useTrailTheme } from '../../../components/TrailThemeContext';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountCallHierarchyPanel, type CallHierarchyPanelVanillaProps } from '../../../views/c4/panels/callHierarchyPanel';


export interface CallHierarchyRootFunction {
  readonly filePath: string;
  readonly fnName: string;
  readonly startLine?: number;
}

export interface CallHierarchyPanelProps {
  readonly rootFunction: CallHierarchyRootFunction | null;
  readonly apiBaseUrl: string;
  readonly t: (key: string) => string;
  readonly isDark?: boolean;
}

export const CallHierarchyPanel: React.FC<CallHierarchyPanelProps> = ({
  rootFunction,
  apiBaseUrl,
  t,
  isDark,
}) => {
  const trailTheme = useTrailTheme();
  const dark = isDark ?? trailTheme.isDark;
  const c = trailTheme.colors;

  const viewProps: CallHierarchyPanelVanillaProps = {
    rootFunction,
    apiBaseUrl,
    t,
    isDark: dark,
    colors: {
      border: c.border,
      textPrimary: c.textPrimary,
      textSecondary: c.textSecondary,
      error: c.error,
    },
  };

  return <VanillaIsland mount={mountCallHierarchyPanel} props={viewProps} />;
};
