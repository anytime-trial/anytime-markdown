import { VanillaIsland } from '../../../../shared/vanillaIsland';
import { mountChartTitle } from '../../../../views/analytics/charts/shared/chartTitle';

export function ChartTitle({ title, description }: Readonly<{ title: string; description?: string }>) {
  return <VanillaIsland mount={mountChartTitle} props={{ title, description }} />;
}
