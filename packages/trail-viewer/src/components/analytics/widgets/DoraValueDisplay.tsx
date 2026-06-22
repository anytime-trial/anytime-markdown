import type React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountDoraValueDisplay } from '../../../views/analytics/widgets/doraValueDisplay';
export { formatDoraValue } from '../../../views/analytics/widgets/doraValueDisplay';

export function DoraValueDisplay({
  metric,
}: Readonly<{ metric: { value: number; unit: string } }>): React.ReactElement {
  return <VanillaIsland mount={mountDoraValueDisplay} props={{ metric }} />;
}
