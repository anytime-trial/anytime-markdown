import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { formatLocalTime, toLocalDateKey } from '@anytime-markdown/trail-core/formatDate';
import { useTrailTheme } from '../../TrailThemeContext';
import { useTrailI18n } from '../../../i18n';
import { agentBrandColors } from '../../../theme/designTokens';
import type { ToolMetrics, TrailMessage, TrailSession, TrailSessionCommit } from '../../../domain/parser/types';
import { fmtNum, fmtTokens, fmtUsd } from '../../../domain/analytics/formatters';
import { sessionCost } from '../../../domain/analytics/calculators';
import { buildDaySession } from '../helpers';
import { SessionCacheTimeline } from '../charts/SessionCacheTimeline';
import { SessionErrorChart } from '../charts/SessionErrorChart';
import { SessionSkillUsageChart } from '../charts/SessionSkillUsageChart';
import { SessionToolUsageChart } from '../charts/SessionToolUsageChart';
import { SessionCommitPrefixChart } from '../charts/SessionCommitPrefixChart';
import { DayCommitPrefixChart } from '../charts/DayCommitPrefixChart';
import { SessionMetricsPanel } from './SessionMetricsPanel';

export function DailySessionList({
  date,
  sessions,
  sessionsLoading,
  onSelectSession,
  onJumpToTrace,
  fetchSessionMessages,
  fetchSessionCommits,
  fetchSessionToolMetrics,
  fetchDayToolMetrics,
}: Readonly<{
  date: string;
  sessions: readonly TrailSession[];
  sessionsLoading?: boolean;
  onSelectSession?: (id: string) => void;
  onJumpToTrace?: (session: TrailSession) => void;
  fetchSessionMessages?: (id: string) => Promise<readonly TrailMessage[]>;
  fetchSessionCommits?: (id: string) => Promise<readonly TrailSessionCommit[]>;
  fetchSessionToolMetrics?: (id: string) => Promise<ToolMetrics | null>;
  fetchDayToolMetrics?: (date: string) => Promise<ToolMetrics | null>;
}>) {
  const { colors, cardSx, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const [timelineSessionId, setTimelineSessionId] = useState<string | null>(null);
  const [timelineMessages, setTimelineMessages] = useState<readonly TrailMessage[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [sessionToolMetrics, setSessionToolMetrics] = useState<ToolMetrics | null>(null);
  const [dayAggToolMetrics, setDayAggToolMetrics] = useState<ToolMetrics | null>(null);
  const daySessions = sessions.filter((s) => toLocalDateKey(s.startTime) === date);
  const sessionCountLabel = daySessions.length !== 1
    ? t('sessionList.sessions')
    : t('sessionList.session');
  const headerLabel = sessionsLoading
    ? '...'
    : `${daySessions.length} ${sessionCountLabel}`;
  const selectedTimelineSession = timelineSessionId
    ? daySessions.find((s) => s.id === timelineSessionId)
    : undefined;

  useEffect(() => {
    if (!fetchDayToolMetrics) {
      setDayAggToolMetrics(null);
      return;
    }
    let cancelled = false;
    void fetchDayToolMetrics(date).then((result) => {
      if (!cancelled) setDayAggToolMetrics(result);
    });
    return () => { cancelled = true; };
  }, [date, fetchDayToolMetrics]);

  // 最後にクリックされたセッション ID。並行フェッチが順不同で解決しても、
  // 最新クリック以外の結果で timeline を上書きしないようガードする。
  const latestRequestRef = useRef<string | null>(null);

  const handleSessionClick = (id: string) => {
    if (timelineSessionId === id) {
      latestRequestRef.current = null;
      setTimelineSessionId(null);
      setTimelineMessages([]);
      setSessionToolMetrics(null);
      return;
    }
    if (fetchSessionMessages) {
      latestRequestRef.current = id;
      setTimelineSessionId(id);
      setTimelineLoading(true);
      setSessionToolMetrics(null);
      void fetchSessionMessages(id).then((msgs) => {
        if (latestRequestRef.current !== id) return;
        setTimelineMessages(msgs);
        setTimelineLoading(false);
      });
      if (fetchSessionToolMetrics) {
        void fetchSessionToolMetrics(id).then((metrics) => {
          if (latestRequestRef.current !== id) return;
          setSessionToolMetrics(metrics);
        });
      }
    } else {
      onSelectSession?.(id);
    }
  };

  return (
    <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5 }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2">
          {date} — {headerLabel}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' } }}>
        {/* Left: fixed height matches right column when session selected */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', ...scrollbarSx, ...((daySessions.length > 0 || sessionsLoading) ? { height: { lg: 726 } } : { maxHeight: { lg: 726 } }) }}>
          {sessionsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : daySessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('sessionList.noSessionsFound')}</Typography>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { color: colors.textSecondary, borderColor: colors.border, bgcolor: colors.midnightNavy } }}>
                  <TableCell>Session</TableCell>
                  <TableCell>{t('sessionList.timeHeader')}</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">{t('sessionList.locHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.tokensHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.costHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.messagesHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.errorsHeader')}</TableCell>
                  <TableCell align="right">{t('sessionList.subAgents')}</TableCell>
                  <TableCell align="right" sx={{ width: 36 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {daySessions.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    selected={timelineSessionId === s.id}
                    sx={{ cursor: 'pointer', '& .MuiTableCell-root': { borderColor: colors.border } }}
                    onClick={() => handleSessionClick(s.id)}
                  >
                    <TableCell sx={{ maxWidth: 200, minWidth: 120 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, color: colors.iceBlue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {s.slug ?? s.id.slice(0, 8)}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: colors.textSecondary, fontFamily: 'monospace', display: 'block' }}
                      >
                        {s.id.slice(0, 8)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {formatLocalTime(s.startTime)}–{formatLocalTime(s.endTime)}
                      {s.interruption?.interrupted && (
                        <Tooltip title={
                          s.interruption.reason === 'max_tokens'
                            ? `${t('sessionList.interruptedMaxTokens')} (${t('sessionList.contextLabel')} ${fmtTokens(s.interruption.contextTokens)})`
                            : `${t('sessionList.interruptedNoResponse')} (${t('sessionList.contextLabel')} ${fmtTokens(s.interruption.contextTokens)})`
                        }>
                          <Chip
                            label={s.interruption.reason === 'max_tokens' ? t('sessionList.maxChip') : t('sessionList.nrChip')}
                            aria-label={s.interruption.reason === 'max_tokens' ? t('sessionList.interruptedMaxTokens') : t('sessionList.interruptedNoResponse')}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ ml: 0.5, height: 18, fontSize: '0.65rem' }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {(() => {
                        const src = s.source ?? 'claude_code';
                        const brandColor = agentBrandColors[src];
                        return (
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            {brandColor && (
                              <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: brandColor, flexShrink: 0 }} />
                            )}
                            <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: brandColor ?? 'text.secondary' }}>
                              {src}
                            </Typography>
                          </Box>
                        );
                      })()}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {s.commitStats
                        ? `${fmtNum(s.commitStats.linesAdded + s.commitStats.linesDeleted)} (+${fmtNum(s.commitStats.linesAdded)}/-${fmtNum(s.commitStats.linesDeleted)})`
                        : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {fmtTokens(s.usage.inputTokens + s.usage.outputTokens + s.usage.cacheReadTokens + s.usage.cacheCreationTokens)}
                      {s.compactCount != null && s.compactCount >= 2 && (
                        <Tooltip title={t('analytics.compactLoopTooltip')}>
                          <Chip
                            label={`⚠ ×${s.compactCount}`}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ ml: 0.5, height: 16, fontSize: '0.65rem' }}
                          />
                        </Tooltip>
                      )}
                      {(s.initialContextTokens != null || s.peakContextTokens != null) && (
                        <Typography
                          component="div"
                          sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: colors.textSecondary, lineHeight: 1.2 }}
                        >
                          {fmtTokens(s.initialContextTokens ?? 0)}→{fmtTokens(s.peakContextTokens ?? 0)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {fmtUsd(sessionCost(s))}
                    </TableCell>
                    <TableCell align="right">
                      {fmtNum(s.messageCount)}
                      {s.assistantMessageCount != null && s.assistantMessageCount > 0 && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7em' }}>
                          ({fmtNum(s.assistantMessageCount)} {t('analytics.turns')})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {s.errorCount != null && s.errorCount > 0 ? fmtNum(s.errorCount) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {s.subAgentCount != null && s.subAgentCount > 0 ? fmtNum(s.subAgentCount) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ p: 0.5 }}>
                      {onJumpToTrace && (
                        <Tooltip title={t('analytics.openInTraces')}>
                          <IconButton
                            size="small"
                            aria-label={t('analytics.openInTraces')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToTrace(s);
                            }}
                            sx={{ color: colors.textSecondary, '&:hover': { color: colors.iceBlue } }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>

        {/* Right: cards + timeline — day aggregate by default, session detail when selected */}
        {daySessions.length > 0 && (() => {
          const selectedSession = timelineSessionId ? daySessions.find((s) => s.id === timelineSessionId) : undefined;
          if (selectedSession) {
            return (
              <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, width: { lg: 600 } }}>
                <SessionMetricsPanel session={selectedSession} toolMetrics={sessionToolMetrics} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <SessionToolUsageChart toolMetrics={sessionToolMetrics} />
                  <SessionErrorChart toolMetrics={sessionToolMetrics} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <SessionSkillUsageChart toolMetrics={sessionToolMetrics} />
                  {fetchSessionCommits && (
                    <SessionCommitPrefixChart
                      sessionId={timelineSessionId!}
                      fetchSessionCommits={fetchSessionCommits}
                    />
                  )}
                </Box>
              </Box>
            );
          }
          return (
            <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1, width: { lg: 600 } }}>
              <SessionMetricsPanel session={buildDaySession(date, daySessions)} toolMetrics={dayAggToolMetrics} />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <SessionToolUsageChart toolMetrics={dayAggToolMetrics} />
                <SessionErrorChart toolMetrics={dayAggToolMetrics} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <SessionSkillUsageChart toolMetrics={dayAggToolMetrics} />
                {fetchSessionCommits && (
                  <DayCommitPrefixChart
                    sessionIds={daySessions.map((s) => s.id)}
                    fetchSessionCommits={fetchSessionCommits}
                  />
                )}
              </Box>
            </Box>
          );
        })()}
      </Box>
      {timelineSessionId && selectedTimelineSession && (
        timelineLoading ? (
          <Paper elevation={0} sx={{ ...cardSx, mt: 1, p: 1.5, height: 270, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">{t('sessionList.loadingTimeline')}</Typography>
          </Paper>
        ) : (
          <SessionCacheTimeline messages={timelineMessages} session={selectedTimelineSession} />
        )
      )}
    </Paper>
  );
}
