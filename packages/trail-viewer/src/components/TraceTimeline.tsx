import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

import type { TrailMessage, TrailSession, TrailTreeNode } from '../parser/types';
import { useTrailTheme } from './TrailThemeContext';

const TIMELINE_HEIGHT = 140;
const COLLAPSED_HEIGHT = 32;
const STORAGE_KEY = 'trail.timeline.collapsed';

interface TraceTimelineProps {
  readonly nodes: readonly TrailTreeNode[];
  readonly session?: TrailSession;
  readonly onSelectMessage: (uuid: string) => void;
}

function getToolColor(
  toolNames: readonly string[],
  toolColors: { bash: string; edit: string; write: string; read: string; other: string },
): string {
  if (toolNames.includes('Bash')) return toolColors.bash;
  if (toolNames.includes('Edit') || toolNames.includes('MultiEdit')) return toolColors.edit;
  if (toolNames.includes('Write')) return toolColors.write;
  if (toolNames.includes('Read')) return toolColors.read;
  if (toolNames.length > 0) return toolColors.other;
  return toolColors.other;
}

function scrollToMessage(uuid: string): void {
  const el = document.querySelector(`[data-message-uuid="${uuid}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    other: '#FF9800',
  };

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const assistantMessages = useMemo(() => {
    const result: Array<{
      uuid: string;
      timestamp: string;
      toolNames: readonly string[];
      hasCommit: boolean;
    }> = [];
    function traverse(n: TrailTreeNode): void {
      if (n.message.type === 'assistant') {
        const msg = n.message as TrailMessage;
        result.push({
          uuid: msg.uuid,
          timestamp: msg.timestamp,
          toolNames: (msg.toolCalls ?? []).map((tc) => tc.name),
          hasCommit: (msg.triggerCommitHashes?.length ?? 0) > 0,
        });
      }
      for (const child of n.children) traverse(child);
    }
    for (const node of nodes) traverse(node);
    return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [nodes]);

  const sessionStart = session?.startTime ? Date.parse(session.startTime) : 0;
  const sessionEnd = session?.endTime ? Date.parse(session.endTime) : 0;
  const duration = Math.max(sessionEnd - sessionStart, 1);

  const handleBarClick = useCallback((uuid: string) => {
    onSelectMessage(uuid);
    scrollToMessage(uuid);
  }, [onSelectMessage]);

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
      {/* Toggle button */}
      <IconButton
        size="small"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand timeline' : 'Collapse timeline'}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 1,
          color: colors.textSecondary,
        }}
      >
        {collapsed ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowUpIcon fontSize="small" />}
      </IconButton>

      {!collapsed && assistantMessages.length === 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 36,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="caption" sx={{ color: colors.textSecondary }}>
            データなし
          </Typography>
        </Box>
      )}
      {!collapsed && assistantMessages.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            right: 36,
            bottom: 8,
          }}
        >
          {assistantMessages.map((msg) => {
            const msgMs = Date.parse(msg.timestamp);
            const leftPct = sessionStart > 0 ? ((msgMs - sessionStart) / duration) * 100 : 0;
            const barColor = getToolColor(msg.toolNames, toolColors);

            return (
              <Tooltip key={msg.uuid} title={msg.timestamp} placement="top">
                <Box
                  component="button"
                  onClick={() => handleBarClick(msg.uuid)}
                  aria-label={`message at ${msg.timestamp}`}
                  sx={{
                    position: 'absolute',
                    left: `${Math.max(0, Math.min(leftPct, 99))}%`,
                    top: '20%',
                    width: 4,
                    height: '60%',
                    bgcolor: barColor,
                    borderRadius: '2px',
                    border: 'none',
                    cursor: 'pointer',
                    p: 0,
                    transform: 'translateX(-50%)',
                    '&:hover': { opacity: 0.7 },
                    '&:focus-visible': { outline: `2px solid ${colors.iceBlue}`, outlineOffset: '2px' },
                  }}
                >
                  {msg.hasCommit && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: -8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 6,
                        height: 6,
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
        </Box>
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
