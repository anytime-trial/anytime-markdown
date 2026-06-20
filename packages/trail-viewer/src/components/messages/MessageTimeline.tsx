import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Typography, KeyboardArrowUp as KeyboardArrowUpIcon, KeyboardArrowDown as KeyboardArrowDownIcon } from '../../ui';

import type { TrailMessage, TrailSession, TrailTreeNode } from '../../domain/parser/types';
import { useTrailTheme } from '../TrailThemeContext';
import { toolActionColors } from '../../theme/designTokens';

import {
  COLLAPSED_HEIGHT,
  LANE_HEIGHT,
  LANE_LABEL_WIDTH,
  MAX_SUBAGENT_TRACKS,
  PLOT_TOP,
  STORAGE_KEY,
  TIME_AXIS_HEIGHT,
} from './timeline/timelineConstants';
import {
  getAgentColor,
  getDelegatedAgentLabel,
  getTurnColor,
  hashString,
} from './timeline/timelineColors';
import {
  applyScrollHighlight,
  extractAgentCallMeta,
  findMessageEl,
  formatTimeLabel,
  scrollToMessage,
} from './timeline/timelineLayout';
import { useTimelineScrollSync } from './timeline/useTimelineScrollSync';

export { useTimelineScrollSync };

import type { LaneKind, MessageTimelineProps, TimelineEntry, Turn } from './types';




export function MessageTimeline({
  nodes,
  session,
  onSelectMessage,
}: Readonly<MessageTimelineProps>) {
  const { colors } = useTrailTheme();
  const mainAgentLabel = session?.source === 'codex' ? 'Codex' : 'Claude Code';
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toolColors = toolActionColors;

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const timelineMessages = useMemo<readonly TimelineEntry[]>(() => {
    const result: TimelineEntry[] = [];
    function traverse(n: TrailTreeNode): void {
      const msg = n.message as TrailMessage;
      const t = msg.type;
      if (t === 'user' || t === 'assistant' || t === 'system') {
        // type='user' in Claude Code JSONL includes tool_result messages as well.
        // Only messages carrying actual user_content (text input) represent real
        // user instructions. Tool-result user messages are part of the AI turn
        // and are already covered by the AI turn bar, so skip them here.
        if (t === 'user') {
          const hasUserContent = typeof msg.userContent === 'string' && msg.userContent.length > 0;
          if (!hasUserContent) {
            for (const child of n.children) traverse(child);
            return;
          }
        }
        const hasAgentId = typeof msg.agentId === 'string' && msg.agentId.length > 0;
        const agentCall = extractAgentCallMeta(msg.toolCalls as readonly { name: string; input: Record<string, unknown> }[] | undefined);
        const isDelegatedAgentCall = t === 'assistant' && agentCall.delegated;
        const laneKind: LaneKind = (hasAgentId || isDelegatedAgentCall) ? 'subagent' : t;
        const syntheticAgentId = isDelegatedAgentCall
          ? `delegated:${agentCall.subagentType ?? 'unknown'}`
          : undefined;
        const ms = Date.parse(msg.timestamp);
        result.push({
          uuid: msg.uuid,
          timestamp: msg.timestamp,
          ms,
          laneKind,
          agentId: hasAgentId ? msg.agentId : syntheticAgentId,
          agentDescription: msg.agentDescription ?? agentCall.description,
          toolNames: (msg.toolCalls ?? []).map((tc) => tc.name),
          hasCommit: (msg.triggerCommitHashes?.length ?? 0) > 0,
          role: t,
        });
      }
      for (const child of n.children) traverse(child);
    }
    for (const node of nodes) traverse(node);
    return result.sort((a, b) => a.ms - b.ms);
  }, [nodes]);

  // Group messages into turns. A turn starts with a user message and contains
  // all subsequent assistant/subagent/system messages until the next user message.
  const turns = useMemo<readonly Turn[]>(() => {
    const out: Turn[] = [];
    let cur: Turn | null = null;
    const pushCurrent = () => {
      if (cur) out.push(cur);
    };
    for (const msg of timelineMessages) {
      if (msg.role === 'user' && msg.laneKind === 'user') {
        pushCurrent();
        cur = { userMsg: msg, aiMsgs: [], subagentMsgs: [], systemMsgs: [] };
        continue;
      }
      if (!cur) {
        // Orphan messages before first user (unusual): bucket into a synthetic turn
        cur = { userMsg: null, aiMsgs: [], subagentMsgs: [], systemMsgs: [] };
      }
      if (msg.laneKind === 'assistant') cur.aiMsgs.push(msg);
      else if (msg.laneKind === 'subagent') cur.subagentMsgs.push(msg);
      else if (msg.laneKind === 'system') cur.systemMsgs.push(msg);
    }
    pushCurrent();
    return out;
  }, [timelineMessages]);

  // Subagent sub-tracks (one per unique agentId, ordered by first appearance)
  const subagentTracks = useMemo<readonly string[]>(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const m of timelineMessages) {
      if (m.laneKind === 'subagent' && m.agentId && !seen.has(m.agentId)) {
        seen.add(m.agentId);
        order.push(m.agentId);
      }
    }
    return order;
  }, [timelineMessages]);

  const subTrackCount = Math.max(subagentTracks.length, 1);
  const subagentIndex = useMemo(() => {
    const map = new Map<string, number>();
    subagentTracks.forEach((id, i) => map.set(id, i));
    return map;
  }, [subagentTracks]);
  const subagentTrackLabels = useMemo(
    () => subagentTracks.map((id) => getDelegatedAgentLabel(id)),
    [subagentTracks],
  );

  // user(1) + ai(1) + subagent(subTrackCount) + system(1)
  const totalLaneCount = 3 + subTrackCount;
  const totalContentHeight = totalLaneCount * LANE_HEIGHT; // plot area pixel height
  const timelineHeight = totalContentHeight + TIME_AXIS_HEIGHT + PLOT_TOP;
  const maxTimelineHeight = (3 + MAX_SUBAGENT_TRACKS) * LANE_HEIGHT + TIME_AXIS_HEIGHT + PLOT_TOP;
  const displayHeight = Math.min(timelineHeight, maxTimelineHeight);
  const needsScroll = timelineHeight > maxTimelineHeight;
  const laneHeightPct = 100 / totalLaneCount;
  // Lane indices: user=0, ai=1, subagent[i]=2+i, system=2+subTrackCount
  const systemLaneIndex = 2 + subTrackCount;

  const { rangeStart, rangeEnd } = useMemo(() => {
    const sStart = session?.startTime ? Date.parse(session.startTime) : NaN;
    const sEnd = session?.endTime ? Date.parse(session.endTime) : NaN;
    const msgFirst = timelineMessages.length > 0 ? timelineMessages[0].ms : NaN;
    const msgLast = timelineMessages.length > 0 ? timelineMessages[timelineMessages.length - 1].ms : NaN;
    const candidates: number[] = [];
    if (Number.isFinite(sStart)) candidates.push(sStart);
    if (Number.isFinite(msgFirst)) candidates.push(msgFirst);
    if (Number.isFinite(sEnd)) candidates.push(sEnd);
    if (Number.isFinite(msgLast)) candidates.push(msgLast);
    if (candidates.length === 0) return { rangeStart: 0, rangeEnd: 0 };
    const start = Math.min(...candidates);
    const end = Math.max(...candidates);
    return { rangeStart: start, rangeEnd: end > start ? end : start + 1 };
  }, [session, timelineMessages]);

  const duration = Math.max(rangeEnd - rangeStart, 1);
  const includeDate = duration > 24 * 60 * 60 * 1000;

  const handleBarClick = useCallback((uuids: readonly string[]) => {
    const primary = uuids[0];
    if (primary) onSelectMessage(primary);
    scrollToMessage(uuids, colors.iceBlue);
  }, [onSelectMessage, colors.iceBlue]);

  const plotLeft = LANE_LABEL_WIDTH;
  const plotRight = 36;
  const plotTop = PLOT_TOP;
  const plotBottom = TIME_AXIS_HEIGHT;

  const toPct = useCallback((ms: number): number => ((ms - rangeStart) / duration) * 100, [rangeStart, duration]);

  function laneCenterPct(laneIndex: number): number {
    return laneIndex * laneHeightPct + laneHeightPct * 0.5;
  }

  // Compute AI turn spans (single horizontal bar per turn)
  const aiTurnBars = useMemo(() => {
    const bars: Array<{
      key: string;
      leftPct: number;
      widthPct: number;
      color: string;
      toolNames: readonly string[];
      startMs: number;
      endMs: number;
      scrollCandidates: readonly string[];
      hasCommit: boolean;
    }> = [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (turn.aiMsgs.length === 0) continue;
      const startMs = turn.aiMsgs[0].ms;
      // end: latest AI ms, but capped at next turn's userMsg if present
      const lastAiMs = turn.aiMsgs[turn.aiMsgs.length - 1].ms;
      const nextUserMs = i + 1 < turns.length && turns[i + 1].userMsg ? (turns[i + 1].userMsg as TimelineEntry).ms : undefined;
      const endMs = nextUserMs !== undefined ? Math.max(lastAiMs, nextUserMs - 1) : lastAiMs;
      const allToolNames = turn.aiMsgs.flatMap((m) => m.toolNames);
      const hasCommit = turn.aiMsgs.some((m) => m.hasCommit);
      // Try every ai message in the turn in order, then fall back to the user
      // message that started the turn, so scrollIntoView hits the first DOM
      // node that actually rendered.
      const scrollCandidates: string[] = turn.aiMsgs.map((m) => m.uuid);
      if (turn.userMsg) scrollCandidates.push(turn.userMsg.uuid);
      bars.push({
        key: turn.aiMsgs[0].uuid,
        leftPct: toPct(startMs),
        widthPct: Math.max(toPct(endMs) - toPct(startMs), 0.3),
        color: getTurnColor(allToolNames, toolColors),
        toolNames: allToolNames,
        startMs,
        endMs,
        scrollCandidates,
        hasCommit,
      });
    }
    return bars;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, toPct]);

  // Compute User↔AI dashed connectors
  const connectors = useMemo(() => {
    const out: Array<{
      key: string;
      x1Pct: number;
      x2Pct: number;
    }> = [];
    for (const turn of turns) {
      if (!turn.userMsg || turn.aiMsgs.length === 0) continue;
      out.push({
        key: `conn-${turn.userMsg.uuid}`,
        x1Pct: toPct(turn.userMsg.ms),
        x2Pct: toPct(turn.aiMsgs[0].ms),
      });
    }
    return out;
  }, [turns, toPct]);

  return (
    <Box
      data-testid="message-timeline"
      sx={{
        height: collapsed ? COLLAPSED_HEIGHT : displayHeight,
        bgcolor: colors.charcoal,
        borderBottom: `1px solid ${colors.border}`,
        position: 'relative',
        overflow: 'hidden',
        transition: 'height 0.2s ease',
        flexShrink: 0,
      }}
      role="region"
      aria-label="Trace timeline"
    >
      <IconButton
        size="small"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand timeline' : 'Collapse timeline'}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 2,
          color: colors.textSecondary,
        }}
      >
        {collapsed ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowUpIcon fontSize="small" />}
      </IconButton>

      {!collapsed && (
        <>
          {/* Scrollable wrapper: covers plot area (excludes time axis) */}
          <Box
            sx={{
              position: 'absolute',
              top: plotTop,
              left: 0,
              right: 0,
              bottom: plotBottom,
              overflowY: needsScroll ? 'auto' : 'hidden',
            }}
          >
            {/* Inner container: full content height, provides scroll target */}
            <Box sx={{ position: 'relative', height: totalContentHeight }}>
              {/* Lane labels */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: LANE_LABEL_WIDTH,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* User */}
                <Box sx={{ height: LANE_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, borderRight: `1px solid ${colors.border}` }}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>User</Typography>
                </Box>
                {/* AI */}
                <Box sx={{ height: LANE_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, borderRight: `1px solid ${colors.border}` }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.1 }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>{mainAgentLabel}</Typography>
                    {session?.version && (
                      <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.6rem', opacity: 0.7 }}>
                        v{session.version}
                      </Typography>
                    )}
                  </Box>
                </Box>
                {/* Delegated agent tracks */}
                {subagentTracks.length > 0 ? (
                  subagentTracks.map((_, idx) => (
                    <Box
                      key={`subagent-label-${idx}`}
                      sx={{ height: LANE_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, borderRight: `1px solid ${colors.border}` }}
                    >
                      <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
                        {subagentTrackLabels[idx] ?? 'Claude Code'}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <Box sx={{ height: LANE_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, borderRight: `1px solid ${colors.border}` }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
                      -
                    </Typography>
                  </Box>
                )}
                {/* System */}
                <Box sx={{ height: LANE_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 1, borderRight: `1px solid ${colors.border}` }}>
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>System</Typography>
                </Box>
              </Box>

              {/* Plot area */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: plotLeft,
                  right: plotRight,
                  bottom: 0,
                }}
              >
            {/* Lane background separators */}
            {Array.from({ length: totalLaneCount }, (_, i) => (
              <Box
                key={`lane-bg-${i}`}
                sx={{
                  position: 'absolute',
                  top: `${i * laneHeightPct}%`,
                  left: 0,
                  right: 0,
                  height: `${laneHeightPct}%`,
                  borderBottom: i < totalLaneCount - 1 ? `1px dashed ${colors.border}` : 'none',
                }}
              />
            ))}

            {/* SVG overlay for dashed User→AI connectors */}
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1,
              }}
              aria-hidden="true"
            >
              {connectors.map((c) => {
                const userY = laneCenterPct(0);
                const aiY = laneCenterPct(1);
                return (
                  <line
                    key={c.key}
                    x1={`${c.x1Pct}%`}
                    y1={`${userY}%`}
                    x2={`${c.x2Pct}%`}
                    y2={`${aiY}%`}
                    stroke={colors.iceBlue}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                    opacity={0.5}
                  />
                );
              })}
            </svg>

            {timelineMessages.length === 0 && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                  データなし
                </Typography>
              </Box>
            )}

            {/* User bars */}
            {timelineMessages
              .filter((m) => m.laneKind === 'user')
              .map((msg) => {
                const leftPct = toPct(msg.ms);
                const topPct = laneHeightPct * 0.35; // user lane index = 0
                const heightPct = laneHeightPct * 0.3;
                return (
                  <Tooltip key={msg.uuid} title={`[user] ${msg.timestamp}`} placement="top">
                    <Box
                      component="button"
                      onClick={() => handleBarClick([msg.uuid])}
                      aria-label={`user message at ${msg.timestamp}`}
                      sx={{
                        position: 'absolute',
                        left: `${Math.max(0, Math.min(leftPct, 99.5))}%`,
                        top: `${topPct}%`,
                        width: 4,
                        height: `${heightPct}%`,
                        bgcolor: colors.iceBlue,
                        borderRadius: '2px',
                        border: 'none',
                        cursor: 'pointer',
                        p: 0,
                        transform: 'translateX(-50%)',
                        zIndex: 2,
                        '&:hover': { opacity: 0.7 },
                      }}
                    />
                  </Tooltip>
                );
              })}

            {/* AI turn bars (one per turn, spanning the turn duration) */}
            {aiTurnBars.map((bar) => {
              const topPct = 1 * laneHeightPct + laneHeightPct * 0.35; // ai lane index = 1
              const heightPct = laneHeightPct * 0.3;
              const toolSuffix = bar.toolNames.length > 0 ? ` · ${Array.from(new Set(bar.toolNames)).join(', ')}` : '';
              const durMs = bar.endMs - bar.startMs;
              const tooltipLabel = `[AI turn] ${formatTimeLabel(bar.startMs, includeDate)} - ${formatTimeLabel(bar.endMs, includeDate)} (${Math.round(durMs / 1000)}s)${toolSuffix}`;
              return (
                <Tooltip key={bar.key} title={tooltipLabel} placement="top">
                  <Box
                    component="button"
                    onClick={() => handleBarClick(bar.scrollCandidates)}
                    aria-label={`AI turn ${bar.startMs}`}
                    sx={{
                      position: 'absolute',
                      left: `${Math.max(0, Math.min(bar.leftPct, 99.5))}%`,
                      top: `${topPct}%`,
                      width: `${Math.max(bar.widthPct, 0.3)}%`,
                      minWidth: 3,
                      height: `${heightPct}%`,
                      bgcolor: bar.color,
                      borderRadius: '2px',
                      border: 'none',
                      cursor: 'pointer',
                      p: 0,
                      zIndex: 2,
                      '&:hover': { opacity: 0.7 },
                    }}
                  >
                    {bar.hasCommit && (
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: -5,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          bgcolor: colors.iceBlue,
                        }}
                        aria-hidden="true"
                      />
                    )}
                  </Box>
                </Tooltip>
              );
            })}

            {/* Subagent bars (per message, in sub-tracks by agentId) */}
            {timelineMessages
              .filter((m) => m.laneKind === 'subagent')
              .map((msg) => {
                const leftPct = toPct(msg.ms);
                const trackIndex = msg.agentId ? subagentIndex.get(msg.agentId) ?? 0 : 0;
                const topPct = (2 + trackIndex) * laneHeightPct + laneHeightPct * 0.35;
                const heightPct = laneHeightPct * 0.3;
                const color = msg.agentId ? getAgentColor(msg.agentId) : toolColors.plain;
                const toolSuffix = msg.toolNames.length > 0 ? ` · ${Array.from(new Set(msg.toolNames)).join(', ')}` : '';
                const tooltipLabel = `[subagent] ${msg.timestamp}${msg.agentId ? ` · ${msg.agentId.slice(0, 8)}` : ''}${msg.agentDescription ? ` (${msg.agentDescription})` : ''}${toolSuffix}`;
                return (
                  <Tooltip key={msg.uuid} title={tooltipLabel} placement="top">
                    <Box
                      component="button"
                      onClick={() => handleBarClick([msg.uuid])}
                      aria-label={`subagent message at ${msg.timestamp}`}
                      sx={{
                        position: 'absolute',
                        left: `${Math.max(0, Math.min(leftPct, 99.5))}%`,
                        top: `${topPct}%`,
                        width: 3,
                        height: `${heightPct}%`,
                        bgcolor: color,
                        borderRadius: '2px',
                        border: 'none',
                        cursor: 'pointer',
                        p: 0,
                        transform: 'translateX(-50%)',
                        zIndex: 2,
                        '&:hover': { opacity: 0.7 },
                      }}
                    />
                  </Tooltip>
                );
              })}

            {/* System bars (per message) */}
            {timelineMessages
              .filter((m) => m.laneKind === 'system')
              .map((msg) => {
                const leftPct = toPct(msg.ms);
                const topPct = systemLaneIndex * laneHeightPct + laneHeightPct * 0.35;
                const heightPct = laneHeightPct * 0.3;
                return (
                  <Tooltip key={msg.uuid} title={`[system] ${msg.timestamp}`} placement="top">
                    <Box
                      component="button"
                      onClick={() => handleBarClick([msg.uuid])}
                      aria-label={`system message at ${msg.timestamp}`}
                      sx={{
                        position: 'absolute',
                        left: `${Math.max(0, Math.min(leftPct, 99.5))}%`,
                        top: `${topPct}%`,
                        width: 3,
                        height: `${heightPct}%`,
                        bgcolor: toolColors.plain,
                        borderRadius: '2px',
                        border: 'none',
                        cursor: 'pointer',
                        p: 0,
                        transform: 'translateX(-50%)',
                        zIndex: 2,
                        '&:hover': { opacity: 0.7 },
                      }}
                    />
                  </Tooltip>
                );
              })}
              </Box>{/* Plot area */}
            </Box>{/* Inner container */}
          </Box>{/* Scrollable wrapper */}

          {/* Time axis */}
          <Box
            sx={{
              position: 'absolute',
              left: plotLeft,
              right: plotRight,
              bottom: 0,
              height: TIME_AXIS_HEIGHT,
              borderTop: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1,
            }}
          >
            <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
              {formatTimeLabel(rangeStart, includeDate)}
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
              {formatTimeLabel(rangeEnd, includeDate)}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
