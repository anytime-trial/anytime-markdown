import { useState } from 'react';
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
import { useTrailTheme } from './TrailThemeContext';
import { ToolCallDetail } from './ToolCallDetail';

interface MessageNodeProps {
  readonly message: TrailMessage;
  readonly depth: number;
}

const LINE_HEIGHT_PX = 20;
const COLLAPSED_LINES = 3;
const COLLAPSED_MAX_HEIGHT = LINE_HEIGHT_PX * COLLAPSED_LINES;

function getAvatarProps(
  type: TrailMessage['type'],
  hasToolCalls: boolean,
  avColors: { user: string; system: string; tool: string; assistant: string },
) {
  if (type === 'user') {
    return { icon: <PersonIcon />, bgcolor: avColors.user };
  }
  if (type === 'system') {
    return { icon: <SettingsIcon />, bgcolor: avColors.system };
  }
  if (hasToolCalls) {
    return { icon: <BuildIcon />, bgcolor: avColors.tool };
  }
  return { icon: <SmartToyIcon />, bgcolor: avColors.assistant };
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
  const { colors, avatarColors, radius } = useTrailTheme();
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

  const avatar = getAvatarProps(message.type, hasToolCalls, avatarColors);

  if (isSystem) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            color: colors.textDisabled,
            bgcolor: colors.hoverBg,
            px: 1.5,
            py: 0.25,
            borderRadius: 2,
            fontSize: '0.7rem',
          }}
        >
          {message.subtype ?? 'system'}
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
        borderColor: colors.border,
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
        {/* Message bubble */}
        <Box
          sx={{
            bgcolor: isUser ? colors.iceBlueSubtle : colors.charcoal,
            color: colors.textPrimary,
            border: isUser
              ? `1px solid rgba(144,202,249,0.3)`
              : `1px solid ${colors.border}`,
            px: 1.5,
            py: 1,
            borderRadius: radius.lg,
            borderTopRightRadius: isUser ? 0 : undefined,
            borderTopLeftRadius: isUser ? undefined : 0,
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
                    color: colors.textSecondary,
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
  const { colors } = useTrailTheme();
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
            color: colors.textSecondary,
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
