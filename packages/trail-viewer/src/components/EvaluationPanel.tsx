import type { TrailEvaluation } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import { mountEvaluationPanel, type EvaluationPanelProps as VanillaProps } from '../views/evaluationPanel';

export interface EvaluationPanelProps {
  readonly evaluations: readonly TrailEvaluation[];
  readonly selectedSessionId?: string;
  readonly onSave: (evaluation: TrailEvaluation) => void;
}

export function EvaluationPanel({
  evaluations,
  selectedSessionId,
  onSave,
}: Readonly<EvaluationPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const { colors, radius } = useTrailTheme();

  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: VanillaProps = {
    evaluations,
    selectedSessionId,
    onSave,
    t: tStr,
    colors: {
      textSecondary: colors.textSecondary,
      border: colors.border,
      amberGold: colors.amberGold,
      amberGoldHover: colors.amberGoldHover,
      textOnLight: colors.textOnLight,
    },
    radius: { md: radius.md },
  };

  return <VanillaIsland mount={mountEvaluationPanel} props={viewProps} />;
}
