import * as React from 'react';
import type { MetricOverlay } from '@anytime-markdown/trail-core/c4';
import { getC4Colors } from '../../../theme/c4Tokens';
import { useTrailI18n } from '../../../i18n/context';
import { VanillaIsland } from '../../../shared/vanillaIsland';
import {
  mountOverlayLegend,
  type CommunityLegendItem,
  type OverlayLegendVanillaProps,
} from '../../../views/c4/overlays/overlayLegend';

export type { CommunityLegendItem };

interface OverlayLegendProps {
  readonly overlay: MetricOverlay;
  readonly isDark: boolean;
  readonly dsmMax?: number;
  readonly sizeMax?: number;
  readonly communityLegend?: readonly CommunityLegendItem[];
  readonly communityTitle?: string;
  readonly inline?: boolean;
}

export function OverlayLegend(props: Readonly<OverlayLegendProps>): React.ReactElement {
  const { t } = useTrailI18n();
  const tStr = (k: string) => t(k as Parameters<typeof t>[0]);
  const colors = getC4Colors(props.isDark);
  const vanillaProps: OverlayLegendVanillaProps = {
    overlay: props.overlay,
    isDark: props.isDark,
    dsmMax: props.dsmMax,
    sizeMax: props.sizeMax,
    communityLegend: props.communityLegend,
    communityTitle: props.communityTitle,
    inline: props.inline,
    t: tStr,
    textColor: colors.overlayLegendText,
    bg: colors.overlayLegendBg,
    dividerColor: colors.border,
  };
  return <VanillaIsland mount={mountOverlayLegend} props={vanillaProps} />;
}
