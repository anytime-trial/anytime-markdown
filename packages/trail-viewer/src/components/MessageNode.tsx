import { useState } from 'react';
import { format } from 'date-fns';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
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

function getAvatarProps(type: TrailMessage['type'], hasToolCalls: boolean) {
  if (type === 'user') {
    return { icon: <PersonIcon />, bgcolor: '#4caf50' };
  }
  if (type === 'system') {
    return { icon: <SettingsIcon />, bgcolor: '#9e9e9e' };
  }
  if (hasToolCalls) {
    return { icon: <BuildIcon />, bgcolor: '#ff9800' };
  }
  return { icon: <SmartToyIcon />, bgcolor: '#2196f3' };
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
  const textContent = (message.userContent ?? message.textContent ?? '').trim();
  const hasTextContent = textContent.length > 0;
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';

  // Skip empty messages (no text and no tool calls)
  if (!hasTextContent && !hasToolCalls && !isSystem) {
    return null;
  }

  const needsCollapse = textContent.split('\n').length > COLLAPSED_LINES
    || textContent.length > 200;

  const avatar = getAvatarProps(message.type, hasToolCalls);

  if (isSystem) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            bgcolor: 'action.hover',
            px: 1.5,
            py: 0.25,
            borderRadius: 2,
            fontSize: '0.7rem',
          }}
        >
          {message.subtype ?? 'system'} &middot; {formatTimestamp(message.timestamp)}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 1,
        py: 0.5,
        px: 1,
        pl: 1,
        borderLeft: message.isSidechain ? '2px dashed' : 'none',
        borderColor: 'divider',
      }}
    >
      {/* Avatar */}
      <Avatar
        sx={{
          width: 32,
          height: 32,
          bgcolor: avatar.bgcolor,
          flexShrink: 0,
          mb: 0.5,
        }}
      >
        {avatar.icon}
      </Avatar>

      {/* Bubble */}
      <Box
        sx={{
          maxWidth: '75%',
          minWidth: 60,
        }}
      >
        {/* Timestamp */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            color: 'text.disabled',
            textAlign: isUser ? 'right' : 'left',
            fontSize: '0.65rem',
            mb: 0.25,
          }}
        >
          {formatTimestamp(message.timestamp)}
        </Typography>

        {/* Message bubble */}
        <Box
          sx={{
            bgcolor: isUser ? 'primary.main' : 'action.hover',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            px: 1.5,
            py: 1,
            borderRadius: 2,
            borderTopRightRadius: isUser ? 0 : undefined,
            borderTopLeftRadius: isUser ? undefined : 0,
            '.MuiTypography-root': isUser ? { color: 'inherit' } : undefined,
          }}
        >
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
                  sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.85rem' }}
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
                    color: isUser ? 'primary.contrastText' : 'text.secondary',
                  }}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  <ExpandMoreIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )}

          {hasToolCalls && message.toolCalls?.map((tc) => (
            <ToolCallEntry key={tc.id} toolCall={tc} isUserSide={isUser} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function ToolCallEntry({
  toolCall,
  isUserSide,
}: Readonly<{ toolCall: TrailToolCall; isUserSide: boolean }>) {
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
            color: isUserSide ? 'primary.contrastText' : 'text.secondary',
          }}
          aria-label={expanded ? 'Collapse tool detail' : 'Expand tool detail'}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {getToolCallSummary(toolCall)}
        </Typography>
      </Box>
      <Collapse in={expanded}>
        <ToolCallDetail toolCall={toolCall} />
      </Collapse>
    </Box>
  );
}
