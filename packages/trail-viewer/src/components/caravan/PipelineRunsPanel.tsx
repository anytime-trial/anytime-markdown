import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { VanillaIsland } from '../../shared/vanillaIsland';
import {
  mountPipelineRunsPanel,
  type PipelineRunsPanelProps as PipelineRunsPanelVanillaProps,
} from '../../views/caravan/pipelineRunsPanel';
import type { CaravanReader } from '../../data/readers/CaravanReader';

export interface PipelineRunsPanelProps {
  readonly reader: CaravanReader | null;
}

export function PipelineRunsPanel({ reader }: Readonly<PipelineRunsPanelProps>) {
  const { t } = useTrailI18n();
  const { isDark } = useTrailTheme();
  const tStr = (key: string): string => t(key as Parameters<typeof t>[0]);

  const viewProps: PipelineRunsPanelVanillaProps = {
    t: tStr,
    reader,
    isDark,
  };

  return <VanillaIsland mount={mountPipelineRunsPanel} props={viewProps} />;
}
