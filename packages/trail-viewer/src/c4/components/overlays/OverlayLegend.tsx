import { Box, Tooltip, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { MetricOverlay } from '@anytime-markdown/trail-core/c4';
import { getC4Colors } from '../../../theme/c4Tokens';
import { useTrailI18n } from '../../../i18n/context';
import type { TrailI18n } from '../../../i18n/types';
import { COVERAGE_HIGH, COVERAGE_LOW, COVERAGE_MID, COVERAGE_NONE, METRIC_LEGEND_BLUE } from '../../c4MetricColors';

type TrailI18nKey = keyof TrailI18n;

function getOverlayHelpKeys(
  overlay: MetricOverlay,
): { titleKey: TrailI18nKey; descKey: TrailI18nKey } | null {
  if (overlay === 'coverage-lines' || overlay === 'coverage-branches' || overlay === 'coverage-functions') {
    return { titleKey: 'c4.overlayHelp.coverage', descKey: 'c4.overlayHelp.coverage.description' };
  }
  if (overlay === 'dsm-out' || overlay === 'dsm-in') {
    return { titleKey: 'c4.overlayHelp.dsmNeighbors', descKey: 'c4.overlayHelp.dsmNeighbors.description' };
  }
  if (overlay === 'dsm-cyclic') {
    return { titleKey: 'c4.overlayHelp.dsmCyclic', descKey: 'c4.overlayHelp.dsmCyclic.description' };
  }
  if (overlay === 'edit-complexity-most' || overlay === 'edit-complexity-highest') {
    return { titleKey: 'c4.overlayHelp.editComplexity', descKey: 'c4.overlayHelp.editComplexity.description' };
  }
  if (overlay === 'importance') {
    return { titleKey: 'c4.overlayHelp.importance', descKey: 'c4.overlayHelp.importance.description' };
  }
  if (overlay === 'defect-risk') {
    return { titleKey: 'c4.overlayHelp.defectRisk', descKey: 'c4.overlayHelp.defectRisk.description' };
  }
  if (overlay === 'dead-code-score') {
    return { titleKey: 'c4.overlayHelp.deadCode', descKey: 'c4.overlayHelp.deadCode.description' };
  }
  if (overlay === 'size-loc' || overlay === 'size-files' || overlay === 'size-functions') {
    return { titleKey: 'c4.overlayHelp.size', descKey: 'c4.overlayHelp.size.description' };
  }
  return null;
}

function MetricHelpHeader({
  overlay,
  textColor,
}: Readonly<{ overlay: MetricOverlay; textColor: string }>) {
  const { t } = useTrailI18n();
  const help = getOverlayHelpKeys(overlay);
  if (!help) return null;
  const title = t(help.titleKey);
  const description = t(help.descKey);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, minHeight: 16 }}>
      <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.85, lineHeight: 1 }}>
        {title}
      </Typography>
      <Tooltip
        arrow
        placement="left-start"
        title={
          <Box sx={{ p: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, fontSize: '0.7rem' }}>
              {title}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', whiteSpace: 'pre-line', fontSize: '0.7rem', lineHeight: 1.5 }}>
              {description}
            </Typography>
          </Box>
        }
        slotProps={{ tooltip: { sx: { maxWidth: 320 } } }}
      >
        <HelpOutlineIcon
          aria-label={title}
          sx={{ fontSize: 14, color: textColor, opacity: 0.7, cursor: 'help', flexShrink: 0 }}
        />
      </Tooltip>
    </Box>
  );
}

export interface CommunityLegendItem {
  readonly community: number;
  readonly color: string;
  readonly name: string;
  readonly summary?: string;
}

interface OverlayLegendProps {
  readonly overlay: MetricOverlay;
  readonly isDark: boolean;
  /** DSM依存数の最大値（dsm-out/in の場合に表示） */
  readonly dsmMax?: number;
  /** Community オーバーレイ凡例（指定時はメトリクス凡例の上に表示） */
  readonly communityLegend?: readonly CommunityLegendItem[];
  /** 凡例タイトル（i18n 済み文字列） */
  readonly communityTitle?: string;
  /** true のとき position:absolute を使わずインライン表示する */
  readonly inline?: boolean;
}

const SWATCH_SIZE = 12;

function Swatch({ color, label }: Readonly<{ color: string; label: string }>) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: SWATCH_SIZE, height: SWATCH_SIZE, borderRadius: 0.5, bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1 }}>{label}</Typography>
    </Box>
  );
}

export function OverlayLegend({ overlay, isDark, dsmMax, communityLegend, communityTitle, inline }: Readonly<OverlayLegendProps>) {
  const hasCommunity = !!communityLegend && communityLegend.length > 0;
  const hasMetric = overlay !== 'none';
  if (!hasCommunity && !hasMetric) return null;

  const colors = getC4Colors(isDark);
  const bg = colors.overlayLegendBg;
  const textColor = colors.overlayLegendText;
  const dividerColor = colors.border;

  let metricItems: React.ReactNode = null;

  if (overlay === 'coverage-lines' || overlay === 'coverage-branches' || overlay === 'coverage-functions') {
    metricItems = (
      <>
        <Swatch color={COVERAGE_HIGH} label="≥ 80%" />
        <Swatch color={COVERAGE_MID} label="50–79%" />
        <Swatch color={COVERAGE_LOW} label="< 50%" />
        <Swatch color={COVERAGE_NONE} label="—" />
      </>
    );
  } else if (overlay === 'dsm-out' || overlay === 'dsm-in') {
    metricItems = (
      <>
        <Swatch color={COVERAGE_LOW} label={`max${dsmMax !== undefined ? ` (${dsmMax})` : ''}`} />
        <Swatch color={METRIC_LEGEND_BLUE} label="0" />
      </>
    );
  } else if (overlay === 'dsm-cyclic') {
    metricItems = (
      <>
        <Swatch color={COVERAGE_LOW} label="cyclic" />
        <Swatch color={COVERAGE_HIGH} label="ok" />
      </>
    );
  } else if (overlay === 'edit-complexity-most' || overlay === 'edit-complexity-highest') {
    metricItems = (
      <>
        <Swatch color={COVERAGE_LOW} label="high" />
        <Swatch color={COVERAGE_MID} label="multi-file" />
        <Swatch color={METRIC_LEGEND_BLUE} label="search" />
        <Swatch color={COVERAGE_HIGH} label="low" />
      </>
    );
  } else if (overlay === 'importance') {
    metricItems = (
      <>
        <Swatch color={COVERAGE_LOW} label="≥ 70" />
        <Swatch color={COVERAGE_MID} label="40–69" />
        <Swatch color={COVERAGE_HIGH} label="< 40" />
      </>
    );
  } else if (overlay === 'defect-risk') {
    metricItems = (
      <>
        <Swatch color={COVERAGE_LOW} label="≥ 0.7" />
        <Swatch color={COVERAGE_MID} label="0.35–0.7" />
        <Swatch color={COVERAGE_HIGH} label="< 0.35" />
      </>
    );
  } else if (overlay === 'dead-code-score') {
    metricItems = (
      <>
        <Swatch color="#f44336" label="≥ 70" />
        <Swatch color="#ffc107" label="40–69" />
        <Swatch color="#4caf50" label="< 40" />
      </>
    );
  } else if (overlay === 'size-loc') {
    metricItems = (
      <>
        <Swatch color="#c62828" label="≥ 1000" />
        <Swatch color="#f9a825" label="500–999" />
        <Swatch color="#2e7d32" label="< 500" />
      </>
    );
  } else if (overlay === 'size-files') {
    metricItems = (
      <>
        <Swatch color="#c62828" label="≥ 50" />
        <Swatch color="#f9a825" label="20–49" />
        <Swatch color="#2e7d32" label="< 20" />
      </>
    );
  } else if (overlay === 'size-functions') {
    metricItems = (
      <>
        <Swatch color="#c62828" label="≥ 50" />
        <Swatch color="#f9a825" label="10–49" />
        <Swatch color="#2e7d32" label="< 10" />
      </>
    );
  }

  const positionSx = inline
    ? {}
    : {
        position: 'absolute',
        bottom: 12,
        right: 12,
        // 上端に Minimap (top: 8, height ~150px) がいるため、bottom 起点で
        // 上方向に成長する高さを Minimap 領域分（約 180px）控えて制限する。
        maxHeight: 'calc(100% - 180px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        pointerEvents: 'auto',
        zIndex: 10,
        backdropFilter: 'blur(4px)',
        minWidth: 80,
        maxWidth: 220,
        // Webkit 系ブラウザのスクロールバー細身化
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: colors.scrollbarThumb,
          borderRadius: 3,
        },
      };

  return (
    <Box
      sx={{
        ...positionSx,
        bgcolor: bg,
        color: textColor,
        borderRadius: 1,
        px: 1,
        py: 0.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.4,
      }}
    >
      {hasCommunity && (
        <>
          {communityTitle && (
            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 700, opacity: 0.85 }}>
              {communityTitle}
            </Typography>
          )}
          {communityLegend!.map((item) => (
            <Swatch
              key={item.community}
              color={item.color}
              label={item.summary ? `${item.name} — ${item.summary}` : item.name}
            />
          ))}
        </>
      )}
      {hasCommunity && hasMetric && (
        <Box sx={{ height: '1px', bgcolor: dividerColor, my: 0.25 }} />
      )}
      {hasMetric && <MetricHelpHeader overlay={overlay} textColor={textColor} />}
      {metricItems}
    </Box>
  );
}
