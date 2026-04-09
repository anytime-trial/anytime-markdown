import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { TrailToolCall } from '../parser/types';
import { useTrailTheme } from './TrailThemeContext';

interface ToolCallDetailProps {
  readonly toolCall: TrailToolCall;
}

function formatJson(value: Record<string, unknown> | string): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function ToolCallDetail({
  toolCall,
}: Readonly<ToolCallDetailProps>) {
  const { cardSx, codeSx, colors } = useTrailTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        mt: 1,
        p: 1.5,
        ...cardSx,
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {toolCall.name}
      </Typography>

      <Box sx={{ mb: toolCall.result ? 1 : 0 }}>
        <Typography
          variant="caption"
          sx={{ color: colors.textSecondary, display: 'block', mb: 0.5 }}
        >
          Input
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            maxHeight: 300,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            ...codeSx,
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
            Result
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1,
              maxHeight: 300,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              ...codeSx,
            }}
          >
            {toolCall.result}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
