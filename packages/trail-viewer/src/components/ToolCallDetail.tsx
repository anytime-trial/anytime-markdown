import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CommitIcon from '@mui/icons-material/Commit';

import type { TrailToolCall } from '../parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';

interface ToolCallDetailProps {
  readonly toolCall: TrailToolCall;
  readonly commitHashes?: readonly string[];
}

function formatJson(value: Record<string, unknown> | string): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function ToolCallDetail({
  toolCall,
  commitHashes,
}: Readonly<ToolCallDetailProps>) {
  const { cardSx, codeSx, colors, scrollbarSx } = useTrailTheme();
  const { t } = useTrailI18n();
  const isGitCommitBash = toolCall.name === 'Bash'
    && typeof toolCall.input?.command === 'string'
    && (toolCall.input.command as string).includes('git commit');
  return (
    <Paper
      elevation={0}
      sx={{
        mt: 1,
        p: 1.5,
        ...cardSx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2">
          {toolCall.name}
        </Typography>
        {isGitCommitBash && commitHashes && commitHashes.length > 0 && commitHashes.map((hash) => (
          <Chip
            key={hash}
            label={`#${hash.slice(0, 7)}`}
            size="small"
            icon={<CommitIcon sx={{ fontSize: 12 }} />}
            sx={{
              height: 18,
              fontSize: '0.65rem',
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

      <Box sx={{ mb: toolCall.result ? 1 : 0 }}>
        <Typography
          variant="caption"
          sx={{ color: colors.textSecondary, display: 'block', mb: 0.5 }}
        >
          {t('message.input')}
        </Typography>
        <Box
          component="pre"
          tabIndex={0}
          aria-label={t('message.inputCode')}
          sx={{
            m: 0,
            p: 1,
            maxHeight: 300,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            ...scrollbarSx,
            wordBreak: 'break-word',
            ...codeSx,
            '&:focus-visible': { outline: `2px solid ${colors.iceBlue}` },
          }}
        >
          {formatJson(toolCall.input)}
        </Box>
      </Box>

      {toolCall.result !== undefined && (
        <Box>
          <Typography
            variant="caption"
            sx={{ color: colors.textSecondary, display: 'block', mb: 0.5 }}
          >
            {t('message.result')}
          </Typography>
          <Box
            component="pre"
            tabIndex={0}
            aria-label={t('message.resultCode')}
            sx={{
              m: 0,
              p: 1,
              maxHeight: 300,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              ...codeSx,
              '&:focus-visible': { outline: `2px solid ${colors.iceBlue}` },
            }}
          >
            {toolCall.result}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
