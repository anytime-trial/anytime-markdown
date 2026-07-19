import type React from 'react';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import { mountCyclingCard } from '../../../views/analytics/widgets/cyclingCard';
import { OVERVIEW_CARD_SIZING } from '../../../views/analytics/widgets/overviewCardShell';
import type { CyclingCardProps } from '../../../views/analytics/widgets/cyclingCard';
import type { MetricItem } from '../types';

export function CyclingCard({
  groupName,
  items,
  index,
  onCycle,
  cardStyle,
}: Readonly<{
  groupName: string;
  items: readonly MetricItem[];
  index: number;
  onCycle: () => void;
  cardStyle: Record<string, unknown>;
}>): React.ReactElement {
  const cardSx = {
    bgcolor: String(cardStyle.bgcolor ?? cardStyle.backgroundColor ?? '#1e1e1e'),
    border: String(cardStyle.border ?? '1px solid #333'),
    borderRadius: String(cardStyle.borderRadius ?? '8px'),
  };
  const vanillaItems = items.map((it) => ({
    label: it.label,
    value: String(it.value ?? ''),
    badge: it.badge,
    delta: it.delta,
    tooltip: it.tooltip,
  }));
  const vanillaProps: CyclingCardProps = {
    groupName,
    items: vanillaItems,
    index,
    onCycle,
    cardSx,
    sizing: OVERVIEW_CARD_SIZING,
  };
  return <VanillaIsland mount={mountCyclingCard} props={vanillaProps} />;
}
