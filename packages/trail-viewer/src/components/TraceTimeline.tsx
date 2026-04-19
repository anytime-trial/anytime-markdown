import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

import type { TrailMessage, TrailSession, TrailTreeNode } from '../parser/types';
import { useTrailTheme } from './TrailThemeContext';

const TIMELINE_HEIGHT = 200;
const COLLAPSED_HEIGHT = 32;
const STORAGE_KEY = 'trail.timeline.collapsed';
const LANE_LABEL_WIDTH = 88;
const TIME_AXIS_HEIGHT = 24;

type LaneKind = 'user' | 'assistant' | 'system' | 'subagent';

const LANES: readonly { readonly kind: LaneKind; readonly label: string }[] = [
  { kind: 'user', label: 'User' },
  { kind: 'assistant', label: 'AI' },
  { kind: 'subagent', label: 'Subagent' },
  { kind: 'system', label: 'System' },
];

const LANE_INDEX: Readonly<Record<LaneKind, number>> = {
  user: 0,
  assistant: 1,
  subagent: 2,
  system: 3,
};

const AGENT_PALETTE = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#6A4C93', '#1982C4',
  '#8AC926', '#F48C06', '#E56B6F', '#52B788', '#B5838D',
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getAgentColor(agentId: string): string {
  return AGENT_PALETTE[hashString(agentId) % AGENT_PALETTE.length];
}

function getTurnColor(
  toolNames: readonly string[],
  toolColors: { bash: string; edit: string; write: string; read: string; task: string; other: string; plain: string },
): string {
  if (toolNames.includes('Task')) return toolColors.task;
  if (toolNames.includes('Bash')) return toolColors.bash;
  if (toolNames.includes('Edit') || toolNames.includes('MultiEdit')) return toolColors.edit;
  if (toolNames.includes('Write')) return toolColors.write;
  if (toolNames.includes('Read')) return toolColors.read;
  if (toolNames.length > 0) return toolColors.other;
  return toolColors.plain;
}

function findMessageEl(uuids: readonly string[]): HTMLElement | null {
  for (const uuid of uuids) {
    const el = document.querySelector(`[data-message-uuid="${uuid}"]`) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

function applyScrollHighlight(el: HTMLElement, highlightColor: string): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const prevOutline = el.style.outline;
  const prevOutlineOffset = el.style.outlineOffset;
  const prevTransition = el.style.transition;
  el.style.transition = 'outline-color 0.2s ease';
  el.style.outline = `2px solid ${highlightColor}`;
  el.style.outlineOffset = '4px';
  window.setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOutlineOffset;
    el.style.transition = prevTransition;
  }, 1500);
}

function scrollToMessage(uuids: readonly string[], highlightColor: string): void {
  const el = findMessageEl(uuids);
  if (el) applyScrollHighlight(el, highlightColor);
}

function formatTimeLabel(ms: number, includeDate: boolean): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = includeDate
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    : { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

interface TraceTimelineProps {
  readonly nodes: readonly TrailTreeNode[];
  readonly session?: TrailSession;
  readonly onSelectMessage: (uuid: string) => void;
}

interface TimelineEntry {
  readonly uuid: string;
  readonly timestamp: string;
  readonly ms: number;
  readonly laneKind: LaneKind;
  readonly agentId?: string;
  readonly agentDescription?: string;
  readonly toolNames: readonly string[];
  readonly hasCommit: boolean;
  readonly role: string;
}

interface Turn {
  readonly userMsg: TimelineEntry | null;
  readonly aiMsgs: TimelineEntry[];
  readonly subagentMsgs: TimelineEntry[];
  readonly systemMsgs: TimelineEntry[];
}

export function TraceTimeline({
  nodes,
  session,
  onSelectMessage,
}: Readonly<TraceTimelineProps>) {
  const { colors } = useTrailTheme();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toolColors = {
    bash: '#4CAF50',
    edit: '#2196F3',
    write: '#9C27B0',
    read: '#757575',
    task: '#FFB300',
    other: '#FF9800',
    plain: '#90A4AE',
  };

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
        const laneKind: LaneKind = hasAgentId ? 'subagent' : t;
        const ms = Date.parse(msg.timestamp);
        result.push({
          uuid: msg.uuid,
          timestamp: msg.timestamp,
          ms,
          laneKind,
          agentId: hasAgentId ? msg.agentId : undefined,
          agentDescription: msg.agentDescription,
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
  const plotTop = 8;
  const plotBottom = TIME_AXIS_HEIGHT;

  const laneHeightPct = 100 / LANES.length;

  const toPct = useCallback((ms: number): number => ((ms - rangeStart) / duration) * 100, [rangeStart, duration]);

  function laneCenterPct(kind: LaneKind): number {
    return LANE_INDEX[kind] * laneHeightPct + laneHeightPct * 0.5;
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
      sx={{
        height: collapsed ? COLLAPSED_HEIGHT : TIMELINE_HEIGHT,
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
          {/* Lane labels */}
          <Box
            sx={{
              position: 'absolute',
              top: plotTop,
              left: 0,
              width: LANE_LABEL_WIDTH,
              bottom: plotBottom,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {LANES.map((lane) => (
              <Box
                key={lane.kind}
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  pr: 1,
                  borderRight: `1px solid ${colors.border}`,
                }}
              >
                {lane.kind === 'assistant' ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.1 }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
                      Claude Code
                    </Typography>
                    {session?.version && (
                      <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.6rem', opacity: 0.7 }}>
                        v{session.version}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.7rem' }}>
                    {lane.label}
                    {lane.kind === 'subagent' && subagentTracks.length > 0 && (
                      <Box component="span" sx={{ ml: 0.5, color: colors.textSecondary, opacity: 0.6 }}>
                        ×{subagentTracks.length}
                      </Box>
                    )}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>

          {/* Plot area */}
          <Box
            sx={{
              position: 'absolute',
              top: plotTop,
              left: plotLeft,
              right: plotRight,
              bottom: plotBottom,
            }}
          >
            {/* Lane background separators */}
            {LANES.map((lane, i) => (
              <Box
                key={`lane-bg-${lane.kind}`}
                sx={{
                  position: 'absolute',
                  top: `${i * laneHeightPct}%`,
                  left: 0,
                  right: 0,
                  height: `${laneHeightPct}%`,
                  borderBottom: i < LANES.length - 1 ? `1px dashed ${colors.border}` : 'none',
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
                const userY = laneCenterPct('user');
                const aiY = laneCenterPct('assistant');
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
                const topPct = LANE_INDEX.user * laneHeightPct + laneHeightPct * 0.35;
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
              const topPct = LANE_INDEX.assistant * laneHeightPct + laneHeightPct * 0.35;
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
                const laneBasePct = LANE_INDEX.subagent * laneHeightPct;
                const trackIndex = msg.agentId ? subagentIndex.get(msg.agentId) ?? 0 : 0;
                const trackHeightPct = laneHeightPct / subTrackCount;
                const topPct = laneBasePct + trackIndex * trackHeightPct + trackHeightPct * 0.35;
                const heightPct = trackHeightPct * 0.3;
                const color = msg.agentId ? getAgentColor(msg.agentId) : toolColors.plain;
                const tooltipLabel = `[subagent] ${msg.timestamp}${msg.agentId ? ` · ${msg.agentId.slice(0, 8)}` : ''}${msg.agentDescription ? ` (${msg.agentDescription})` : ''}`;
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
                const topPct = LANE_INDEX.system * laneHeightPct + laneHeightPct * 0.35;
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
          </Box>

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

// IntersectionObserver hook for scroll sync (TraceTree → Timeline)
export function useTimelineScrollSync(
  nodes: readonly TrailTreeNode[],
): { visibleUuid: string | null } {
  const [visibleUuid, setVisibleUuid] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current?.disconnect();

    const uuids = new Set(nodes.flatMap(function collect(n: TrailTreeNode): string[] {
      return [n.message.uuid, ...n.children.flatMap(collect)];
    }));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const uuid = (entry.target as HTMLElement).dataset['messageUuid'];
            if (uuid && uuids.has(uuid)) {
              setVisibleUuid(uuid);
              break;
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    for (const uuid of uuids) {
      const el = document.querySelector(`[data-message-uuid="${uuid}"]`);
      if (el) observer.observe(el);
    }

    observerRef.current = observer;
    return () => observer.disconnect();
  }, [nodes]);

  return { visibleUuid };
}
