import { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import BuildIcon from '@mui/icons-material/Build';
import CommitIcon from '@mui/icons-material/Commit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';

import type { TrailMessage, TrailToolCall } from '../parser/types';
import { useTrailI18n } from '../i18n';
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
  const { t } = useTrailI18n();
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
      data-message-uuid={message.uuid}
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
        aria-label={
          message.type === 'user'
            ? t('message.type.user')
            : message.type === 'assistant'
              ? t('message.type.assistant')
              : t('message.type.system')
        }
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
              ? `1px solid ${colors.iceBlueBorder}`
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
                  aria-label={expanded ? t('message.collapse') : t('message.expand')}
                >
                  <ExpandMoreIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          )}

          {hasToolCalls && message.toolCalls?.map((tc) => (
            <ToolCallEntry key={tc.id} toolCall={tc} isUserSide={isUser} commitHashes={message.triggerCommitHashes} />
          ))}
        </Box>

        {message.triggerCommitHashes && message.triggerCommitHashes.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {message.triggerCommitHashes.map((hash) => (
              <Chip
                key={hash}
                label={`#${hash.slice(0, 7)}`}
                size="small"
                icon={<CommitIcon sx={{ fontSize: 14 }} />}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  color: colors.iceBlue,
                  borderColor: colors.iceBlue,
                  bgcolor: 'transparent',
                  border: '1px solid',
                  '& .MuiChip-icon': { color: colors.iceBlue },
                }}
                aria-label={`commit ${hash}`}
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ToolCallEntry({
  toolCall,
  isUserSide,
  commitHashes,
}: Readonly<{ toolCall: TrailToolCall; isUserSide: boolean; commitHashes?: readonly string[] }>) {
  const { colors } = useTrailTheme();
  const { t } = useTrailI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ my: 0.5 }}>
      <ButtonBase
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t('message.collapseDetail')
            : `${t('message.expandDetail')}: ${getToolCallSummary(toolCall)}`
        }
        sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          textAlign: 'left',
          borderRadius: '4px',
          '&:focus-visible': { outline: `3px solid ${colors.iceBlue}`, outlineOffset: '2px' },
        }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            color: colors.textSecondary,
            flexShrink: 0,
          }}
        />
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', ml: 0.5 }}>
          {getToolCallSummary(toolCall)}
        </Typography>
      </ButtonBase>
      <Collapse in={expanded}>
        <ToolCallDetail toolCall={toolCall} commitHashes={commitHashes} />
      </Collapse>
    </Box>
  );
}
