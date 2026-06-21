import React from 'react';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { useToolCategory } from '../ToolCategoryContext';
import { useSkillCategory } from '../SkillCategoryContext';
import { useCommitCategory } from '../CommitCategoryContext';
import type { AnalyticsPanelProps } from './types';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountAnalyticsPanel } from '../../views/analytics/analyticsPanel';

export function AnalyticsPanel(props: Readonly<AnalyticsPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const tokens = useTrailTheme();
  const toolCategory = useToolCategory();
  const skillCategory = useSkillCategory();
  const commitCategory = useCommitCategory();
  const tStr = (k: string): string => t(k as Parameters<typeof t>[0]);

  return (
    <VanillaIsland
      mount={mountAnalyticsPanel}
      props={{
        ...props,
        tokens,
        t: tStr,
        toolCategory,
        skillCategory,
        commitCategory,
      }}
    />
  );
}
