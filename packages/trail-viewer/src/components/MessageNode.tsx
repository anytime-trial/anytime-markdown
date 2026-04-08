import { useState } from 'react';
import { format } from 'date-fns';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import BuildIcon from '@mui/icons-material/Build';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';

import type { TrailMessage, TrailToolCall } from '../parser/types';
import { ToolCallDetail } from './ToolCallDetail';

interface MessageNodeProps {
  readonly message: TrailMessage;
  readonly depth: number;
}

const LINE_HEIGHT_PX = 20;
const COLLAPSED_LINES = 3;
const COLLAPSED_MAX_HEIGHT = LINE_HEIGHT_PX * COLLAPSED_LINES;

function getMessageIcon(type: TrailMessage['type'], hasToolCalls: boolean) {
  if (type === 'user') return <PersonIcon fontSize="small" />;
  if (type === 'system') return <SettingsIcon fontSize="small" />;
  if (hasToolCalls) return <BuildIcon fontSize="small" />;
  return <SmartToyIcon fontSize="small" />;
}

function getBackgroundColor(
  type: TrailMessage['type'],
): string {
  if (type === 'user') return 'primary.50';
  if (type === 'system') return 'action.hover';
  return 'transparent';
}

function formatTimestamp(timestamp: string): string {
  try {
    return format(new Date(timestamp), 'HH:mm:ss');
  } catch {
    return '';
  }
}

function getToolCallSummary(toolCall: TrailToolCall): string {
  const entries = Object.entries(toolCall.input);
  if (entries.length === 0) return toolCall.name;
  const [key, value] = entries[0];
  const valueStr = typeof value === 'string'
    ? value.slice(0, 60)
    : JSON.stringify(value).slice(0, 60);
  return `${toolCall.name}: ${key}=${valueStr}`;
}

export function MessageNode({
  message,
  depth,
}: Readonly<MessageNodeProps>) {
  const [expanded, setExpanded] = useState(false);
  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;
  const hasTextContent = Boolean(message.textContent ?? message.userContent);
  const textContent = message.userContent ?? message.textContent ?? '';

  const needsCollapse = textContent.split('\n').length > COLLAPSED_LINES
    || textContent.length > 200;

  return (
    <Box
      sx={{
        pl: depth * 2,
        borderLeft: message.isSidechain
          ? '2px dashed'
          : 'none',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          py: 0.5,
          px: 1,
          bgcolor: getBackgroundColor(message.type),
          borderRadius: 1,
          color: message.type === 'system'
            ? 'text.secondary'
            : 'text.primary',
        }}
      >
        <Box sx={{ mt: 0.5, flexShrink: 0 }}>
          {getMessageIcon(message.type, hasToolCalls)}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {message.type === 'system' && message.subtype && (
            <Typography variant="caption" color="text.secondary">
              {message.subtype}
            </Typography>
          )}

          {hasTextContent && (
            <Box>
              <Box
                sx={{
                  maxHeight: !expanded && needsCollapse
                    ? COLLAPSED_MAX_HEIGHT
                    : 'none',
                  overflow: 'hidden',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {textContent}
                </Typography>
              </Box>
              {needsCollapse && (
                <IconButton
                  size="small"
                  onClick={() => setExpanded((prev) => !prev)}
                  sx={{
                    transform: expanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  <ExpandMoreIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )}

          {hasToolCalls && message.toolCalls?.map((tc) => (
            <ToolCallEntry key={tc.id} toolCall={tc} />
          ))}
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flexShrink: 0, mt: 0.5 }}
        >
          {formatTimestamp(message.timestamp)}
        </Typography>
      </Box>
    </Box>
  );
}

function ToolCallEntry({
  toolCall,
}: Readonly<{ toolCall: TrailToolCall }>) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ my: 0.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <IconButton
          size="small"
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
          aria-label={expanded ? 'Collapse tool detail' : 'Expand tool detail'}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {getToolCallSummary(toolCall)}
        </Typography>
      </Box>
      <Collapse in={expanded}>
        <ToolCallDetail toolCall={toolCall} />
      </Collapse>
    </Box>
  );
}
