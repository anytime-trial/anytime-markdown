import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useTheme } from '@mui/material/styles';
import type { QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import type { AnalyticsData, TrailSession } from '../../../domain/parser/types';
import { fmtNum, fmtTokens, fmtUsd } from '../../../domain/analytics/formatters';
import { CyclingCard } from '../widgets/CyclingCard';
import { formatDoraValue } from '../widgets/DoraValueDisplay';
import type { MetricItem } from '../types';

export function OverviewCards({
  totals,
  sessions = [],
  qualityMetrics = null,
}: Readonly<{
  totals: AnalyticsData['totals'];
  sessions?: readonly TrailSession[];
  qualityMetrics?: QualityMetrics | null;
}>) {
  const { cardSx, doraColors } = useTrailTheme();
  const { t } = useTrailI18n();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [usageIdx, setUsageIdx] = useState(0);
  const totalTokens = totals.inputTokens + totals.outputTokens;

  const cards: MetricItem[] = [
    {
      label: t('analytics.totalSessions'),
      value: fmtNum(totals.sessions),
      tooltip: t('analytics.totalSessions.description'),
      delta: totals.comparison?.sessions?.deltaPct != null ? {
        text: `${totals.comparison.sessions.deltaPct > 0 ? '↑' : totals.comparison.sessions.deltaPct < 0 ? '↓' : '→'} ${Math.abs(totals.comparison.sessions.deltaPct).toFixed(1)}%`,
        color: totals.comparison.sessions.deltaPct > 0 ? 'success.main' : totals.comparison.sessions.deltaPct < 0 ? 'error.main' : 'text.secondary',
      } : undefined,
    },
    {
      label: t('analytics.totalTokens'),
      value: fmtTokens(totalTokens),
      tooltip: t('analytics.totalTokens.description'),
      delta: totals.comparison?.tokens?.deltaPct != null ? {
        text: `${totals.comparison.tokens.deltaPct > 0 ? '↑' : totals.comparison.tokens.deltaPct < 0 ? '↓' : '→'} ${Math.abs(totals.comparison.tokens.deltaPct).toFixed(1)}%`,
        color: totals.comparison.tokens.deltaPct > 0 ? 'error.main' : totals.comparison.tokens.deltaPct < 0 ? 'success.main' : 'text.secondary',
      } : undefined,
    },
    {
      label: t('analytics.estimatedCost'),
      value: fmtUsd(totals.estimatedCostUsd),
      tooltip: t('analytics.estimatedCost.description'),
      delta: totals.comparison?.cost?.deltaPct != null ? {
        text: `${totals.comparison.cost.deltaPct > 0 ? '↑' : totals.comparison.cost.deltaPct < 0 ? '↓' : '→'} ${Math.abs(totals.comparison.cost.deltaPct).toFixed(1)}%`,
        color: totals.comparison.cost.deltaPct > 0 ? 'error.main' : totals.comparison.cost.deltaPct < 0 ? 'success.main' : 'text.secondary',
      } : undefined,
    },
    {
      label: t('analytics.totalCommits'),
      value: fmtNum(totals.totalCommits),
      tooltip: t('analytics.totalCommits.description'),
      delta: totals.comparison?.commits?.deltaPct != null ? {
        text: `${totals.comparison.commits.deltaPct > 0 ? '↑' : totals.comparison.commits.deltaPct < 0 ? '↓' : '→'} ${Math.abs(totals.comparison.commits.deltaPct).toFixed(1)}%`,
        color: totals.comparison.commits.deltaPct > 0 ? 'success.main' : totals.comparison.commits.deltaPct < 0 ? 'error.main' : 'text.secondary',
      } : undefined,
    },
    {
      label: t('analytics.linesAdded'),
      value: fmtNum(totals.totalLinesAdded),
      tooltip: t('analytics.linesAdded.description'),
      delta: totals.comparison?.loc?.deltaPct != null ? {
        text: `${totals.comparison.loc.deltaPct > 0 ? '↑' : totals.comparison.loc.deltaPct < 0 ? '↓' : '→'} ${Math.abs(totals.comparison.loc.deltaPct).toFixed(1)}%`,
        color: totals.comparison.loc.deltaPct > 0 ? 'success.main' : totals.comparison.loc.deltaPct < 0 ? 'error.main' : 'text.secondary',
      } : undefined,
    },
    {
      label: t('analytics.totalLoc'),
      value: fmtNum(totals.totalLoc),
      tooltip: t('analytics.totalLoc.description'),
    },
  ];

  const DORA_ID_KEYS: Record<string, string> = {
    deploymentFrequency: 'metrics.deploymentFrequency.name',
    leadTimePerLoc: 'metrics.leadTimePerLoc.name',
    tokensPerLoc: 'metrics.tokensPerLoc.name',
    aiFirstTrySuccessRate: 'metrics.aiFirstTrySuccessRate.name',
    changeFailureRate: 'metrics.changeFailureRate.name',
  };
  const DORA_DESCRIPTION_KEYS: Record<string, string> = {
    deploymentFrequency: 'metrics.deploymentFrequency.description',
    leadTimePerLoc: 'metrics.leadTimePerLoc.description',
    tokensPerLoc: 'metrics.tokensPerLoc.description',
    aiFirstTrySuccessRate: 'metrics.aiFirstTrySuccessRate.description',
    changeFailureRate: 'metrics.changeFailureRate.description',
  };
  const LEVEL_COLORS = doraColors as unknown as Readonly<Record<string, string>>;
  const LEVEL_LABELS: Record<string, string> = {
    elite: 'Elite', high: 'High', medium: 'Medium', low: 'Low',
  };
  const doraCards = qualityMetrics
    ? Object.values(qualityMetrics.metrics)
        .filter((m) => m.sampleSize > 0)
        .map((m) => {
          const deltaPct = m.comparison?.deltaPct ?? null;
          const formatted = formatDoraValue(m);
          return {
            primary: formatted.primary,
            suffix: formatted.suffix,
            unit: formatted.unit,
            label: t((DORA_ID_KEYS[m.id] ?? m.id) as Parameters<typeof t>[0]),
            tooltip: DORA_DESCRIPTION_KEYS[m.id] ? t(DORA_DESCRIPTION_KEYS[m.id] as Parameters<typeof t>[0]) : undefined,
            badge: m.level ? { label: LEVEL_LABELS[m.level], color: LEVEL_COLORS[m.level] } : undefined,
            delta: deltaPct != null ? {
              text: `${deltaPct > 0 ? '↑' : deltaPct < 0 ? '↓' : '→'} ${Math.abs(deltaPct).toFixed(1)}%`,
              color: deltaPct > 0 ? 'success.main' : deltaPct < 0 ? 'error.main' : 'text.secondary',
            } : undefined,
          };
        })
    : [];

  const cardStyle = { ...cardSx, flex: '1 1 140px', p: 2, minWidth: 140, textAlign: 'center', minHeight: '150px' } as const;

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <CyclingCard
        groupName={t('analytics.groupUsage')}
        items={cards}
        index={usageIdx}
        onCycle={() => setUsageIdx((i) => (i + 1) % cards.length)}
        cardStyle={cardStyle}
      />
      {doraCards.map((card) => (
        <Paper key={card.label} elevation={0} sx={{ ...cardStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'left' }}>
              {card.label}
            </Typography>
            {card.tooltip && (
              <Tooltip title={card.tooltip} arrow placement="top">
                <HelpOutlineIcon sx={{ fontSize: 12, color: 'text.disabled', cursor: 'help', flexShrink: 0 }} />
              </Tooltip>
            )}
          </Box>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Typography variant="h3">
                {card.primary}
                {card.suffix && <span style={{ fontSize: '0.45em', fontWeight: 'inherit' }}>{card.suffix}</span>}
              </Typography>
              {card.unit && (
                <Typography variant="caption" color="text.secondary">{card.unit}</Typography>
              )}
              {card.badge && (
                <Chip
                  label={card.badge.label}
                  size="small"
                  sx={{ backgroundColor: card.badge.color, color: '#fff', fontWeight: 700, height: 20, fontSize: 10 }}
                />
              )}
            </Box>
          </Box>
          <Box sx={{ minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {card.delta && (
              <Typography variant="caption" sx={{ color: card.delta.color }}>
                {card.delta.text}
              </Typography>
            )}
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
