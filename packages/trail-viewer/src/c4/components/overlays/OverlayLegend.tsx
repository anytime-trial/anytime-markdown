import { Box, Tooltip, Typography } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { MetricOverlay } from '@anytime-markdown/trail-core/c4';
import { getC4Colors } from '../../../theme/c4Tokens';
import { useTrailI18n } from '../../../i18n/context';
import type { TrailI18n } from '../../../i18n/types';
import { COVERAGE_HIGH, COVERAGE_LOW, COVERAGE_MID, METRIC_LEGEND_BLUE } from '../../c4MetricColors';

type TrailI18nKey = keyof TrailI18n;

function assertNever(value: never): never {
  throw new Error(`Unhandled MetricOverlay: ${String(value)}`);
}

function getOverlayHelpKeys(
  overlay: MetricOverlay,
): { titleKey: TrailI18nKey; descKey: TrailI18nKey } | null {
  switch (overlay) {
    case 'coverage-lines':
    case 'coverage-branches':
    case 'coverage-functions':
      return { titleKey: 'c4.overlayHelp.coverage', descKey: 'c4.overlayHelp.coverage.description' };
    case 'dsm-out':
    case 'dsm-in':
      return { titleKey: 'c4.overlayHelp.dsmNeighbors', descKey: 'c4.overlayHelp.dsmNeighbors.description' };
    case 'dsm-cyclic':
      return { titleKey: 'c4.overlayHelp.dsmCyclic', descKey: 'c4.overlayHelp.dsmCyclic.description' };
    case 'edit-complexity-most':
    case 'edit-complexity-highest':
      return { titleKey: 'c4.overlayHelp.editComplexity', descKey: 'c4.overlayHelp.editComplexity.description' };
    case 'importance':
      return { titleKey: 'c4.overlayHelp.importance', descKey: 'c4.overlayHelp.importance.description' };
    case 'defect-risk':
      return { titleKey: 'c4.overlayHelp.defectRisk', descKey: 'c4.overlayHelp.defectRisk.description' };
    case 'hotspot-frequency':
    case 'hotspot-risk':
      return { titleKey: 'c4.overlayHelp.hotspot', descKey: 'c4.overlayHelp.hotspot.description' };
    case 'dead-code-score':
      return { titleKey: 'c4.overlayHelp.deadCode', descKey: 'c4.overlayHelp.deadCode.description' };
    case 'size-loc':
    case 'size-files':
    case 'size-functions':
      return { titleKey: 'c4.overlayHelp.size', descKey: 'c4.overlayHelp.size.description' };
    case 'none':
    case 'fcmap':
      return null;
    default:
      return assertNever(overlay);
  }
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
  /** size-loc/files/functions オーバーレイの実データ最大値（左端ラベルに表示） */
  readonly sizeMax?: number;
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

// Hotspot 凡例で参照する色は computeColorMap.ts の HOTSPOT_FREQ_BASE / HOTSPOT_RISK_BASE と一致させる。
const HOTSPOT_FREQ_RGB = '232, 160, 18';
const HOTSPOT_RISK_RGB = '232, 80, 28';

function GradientBar({
  background,
  lowLabel,
  highLabel,
  textColor,
}: Readonly<{ background: string; lowLabel: string; highLabel: string; textColor: string }>) {
  return (
    <Box sx={{ width: '100%' }}>
      <Box
        role="img"
        aria-label={`${lowLabel} → ${highLabel}`}
        sx={{
          width: '100%',
          height: 10,
          borderRadius: 0.5,
          background,
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1, color: textColor }}>
          {lowLabel}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1, color: textColor }}>
          {highLabel}
        </Typography>
      </Box>
    </Box>
  );
}

const HOTSPOT_FREQ_GRADIENT = `linear-gradient(to right, rgba(${HOTSPOT_FREQ_RGB}, 0.10), rgba(${HOTSPOT_FREQ_RGB}, 1.0))`;
const HOTSPOT_RISK_GRADIENT = `linear-gradient(to right, rgba(${HOTSPOT_RISK_RGB}, 0.10), rgba(${HOTSPOT_RISK_RGB}, 1.0))`;
const COVERAGE_GRADIENT = `linear-gradient(to right, ${COVERAGE_LOW}, ${COVERAGE_MID}, ${COVERAGE_HIGH})`;
const IMPORTANCE_GRADIENT = `linear-gradient(to right, ${COVERAGE_HIGH}, ${COVERAGE_MID}, ${COVERAGE_LOW})`;
const DSM_NEIGHBORS_GRADIENT = `linear-gradient(to right, ${METRIC_LEGEND_BLUE}, ${COVERAGE_LOW})`;

interface SegmentBarItem {
  readonly color: string;
  readonly label: string;
}

function SegmentBar({
  segments,
  boundaries,
  startLabel,
  endLabel,
  textColor,
}: Readonly<{
  segments: readonly SegmentBarItem[];
  /** 各区間の境界に表示する閾値ラベル。長さは segments.length - 1。指定時はセグメント中央の label は使われない */
  boundaries?: readonly string[];
  /** 境界モードで両端の左 (0%) に表示するラベル */
  startLabel?: string;
  /** 境界モードで両端の右 (100%) に表示するラベル */
  endLabel?: string;
  textColor: string;
}>) {
  const ariaLabel = boundaries
    ? `boundaries: ${boundaries.join(', ')}`
    : segments.map((s) => s.label).join(' / ');
  const tickPositions = boundaries?.map((label, i) => ({
    label,
    leftPct: ((i + 1) / segments.length) * 100,
    transform: 'translateX(-50%)',
  })) ?? [];
  if (boundaries) {
    if (startLabel !== undefined) {
      tickPositions.unshift({ label: startLabel, leftPct: 0, transform: 'translateX(0)' });
    }
    if (endLabel !== undefined) {
      tickPositions.push({ label: endLabel, leftPct: 100, transform: 'translateX(-100%)' });
    }
  }
  return (
    <Box sx={{ width: '100%' }}>
      <Box
        role="img"
        aria-label={ariaLabel}
        sx={{ display: 'flex', width: '100%', height: 10, borderRadius: 0.5, overflow: 'hidden' }}
      >
        {segments.map((s) => (
          <Box key={s.label} sx={{ flex: 1, bgcolor: s.color }} />
        ))}
      </Box>
      {boundaries ? (
        <Box sx={{ position: 'relative', height: 12, mt: 0.25 }}>
          {tickPositions.map((t) => (
            <Typography
              key={t.label}
              variant="caption"
              sx={{
                position: 'absolute',
                left: `${t.leftPct}%`,
                transform: t.transform,
                fontSize: '0.65rem',
                lineHeight: 1,
                color: textColor,
              }}
            >
              {t.label}
            </Typography>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', mt: 0.25 }}>
          {segments.map((s) => (
            <Typography
              key={s.label}
              variant="caption"
              sx={{ flex: 1, fontSize: '0.65rem', lineHeight: 1, color: textColor, textAlign: 'center' }}
            >
              {s.label}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

const SIZE_3_SEGMENTS: readonly SegmentBarItem[] = [
  { color: COVERAGE_HIGH, label: 'low' },
  { color: COVERAGE_MID, label: 'mid' },
  { color: COVERAGE_LOW, label: 'high' },
];

const SIZE_LOC_BOUNDARIES = ['500', '1000'] as const;
const SIZE_FILES_BOUNDARIES = ['20', '50'] as const;
const SIZE_FUNCTIONS_BOUNDARIES = ['10', '50'] as const;

const DSM_CYCLIC_SEGMENTS: readonly SegmentBarItem[] = [
  { color: COVERAGE_HIGH, label: 'ok' },
  { color: COVERAGE_LOW, label: 'cyclic' },
];

function getOverlayMetricItems(
  overlay: MetricOverlay,
  dsmMax: number | undefined,
  sizeMax: number | undefined,
  textColor: string,
): React.ReactNode {
  switch (overlay) {
    case 'coverage-lines':
    case 'coverage-branches':
    case 'coverage-functions':
      return <GradientBar background={COVERAGE_GRADIENT} lowLabel="< 50%" highLabel="≥ 80%" textColor={textColor} />;
    case 'dsm-out':
    case 'dsm-in':
      return (
        <GradientBar
          background={DSM_NEIGHBORS_GRADIENT}
          lowLabel="0"
          highLabel={`max${dsmMax !== undefined ? ` (${dsmMax})` : ''}`}
          textColor={textColor}
        />
      );
    case 'dsm-cyclic':
      return <SegmentBar segments={DSM_CYCLIC_SEGMENTS} textColor={textColor} />;
    case 'edit-complexity-most':
    case 'edit-complexity-highest':
      return (
        <>
          <Swatch color={COVERAGE_LOW} label="high" />
          <Swatch color={COVERAGE_MID} label="multi-file" />
          <Swatch color={METRIC_LEGEND_BLUE} label="search" />
          <Swatch color={COVERAGE_HIGH} label="low" />
        </>
      );
    case 'importance':
      return <GradientBar background={IMPORTANCE_GRADIENT} lowLabel="< 40" highLabel="≥ 70" textColor={textColor} />;
    case 'defect-risk':
      return (
        <>
          <Swatch color={COVERAGE_LOW} label="≥ 0.7" />
          <Swatch color={COVERAGE_MID} label="0.35–0.7" />
          <Swatch color={COVERAGE_HIGH} label="< 0.35" />
        </>
      );
    case 'hotspot-frequency':
      return <GradientBar background={HOTSPOT_FREQ_GRADIENT} lowLabel="low" highLabel="high" textColor={textColor} />;
    case 'hotspot-risk':
      return <GradientBar background={HOTSPOT_RISK_GRADIENT} lowLabel="low" highLabel="high" textColor={textColor} />;
    case 'dead-code-score':
      return (
        <>
          <Swatch color="#f44336" label="≥ 70" />
          <Swatch color="#ffc107" label="40–69" />
          <Swatch color="#4caf50" label="< 40" />
        </>
      );
    case 'size-loc':
      return (
        <SegmentBar
          segments={SIZE_3_SEGMENTS}
          boundaries={SIZE_LOC_BOUNDARIES}
          startLabel="0"
          endLabel={sizeMax !== undefined ? String(sizeMax) : undefined}
          textColor={textColor}
        />
      );
    case 'size-files':
      return (
        <SegmentBar
          segments={SIZE_3_SEGMENTS}
          boundaries={SIZE_FILES_BOUNDARIES}
          startLabel="0"
          endLabel={sizeMax !== undefined ? String(sizeMax) : undefined}
          textColor={textColor}
        />
      );
    case 'size-functions':
      return (
        <SegmentBar
          segments={SIZE_3_SEGMENTS}
          boundaries={SIZE_FUNCTIONS_BOUNDARIES}
          startLabel="0"
          endLabel={sizeMax !== undefined ? String(sizeMax) : undefined}
          textColor={textColor}
        />
      );
    case 'none':
    case 'fcmap':
      return null;
    default:
      return assertNever(overlay);
  }
}

export function OverlayLegend({ overlay, isDark, dsmMax, sizeMax, communityLegend, communityTitle, inline }: Readonly<OverlayLegendProps>) {
  const hasCommunity = !!communityLegend && communityLegend.length > 0;
  const hasMetric = overlay !== 'none';
  if (!hasCommunity && !hasMetric) return null;

  const colors = getC4Colors(isDark);
  const bg = colors.overlayLegendBg;
  const textColor = colors.overlayLegendText;
  const dividerColor = colors.border;

  const metricItems = hasMetric ? getOverlayMetricItems(overlay, dsmMax, sizeMax, textColor) : null;

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
