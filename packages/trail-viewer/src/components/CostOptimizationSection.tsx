import type { CostOptimizationData } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';
import { VanillaIsland } from '../shared/vanillaIsland';
import { mountCostOptimizationSection, type CostOptimizationSectionProps } from '../views/costOptimizationSection';

interface CostOptimizationSectionComponentProps {
  readonly data: CostOptimizationData | null;
}

export function CostOptimizationSection({ data }: Readonly<CostOptimizationSectionComponentProps>) {
  const { t } = useTrailI18n();
  const { isDark } = useTrailTheme();

  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: CostOptimizationSectionProps = {
    t: tStr,
    data,
    isDark,
  };

  return <VanillaIsland mount={mountCostOptimizationSection} props={viewProps} />;
}
