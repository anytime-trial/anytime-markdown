import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { TrailToolCall } from '../parser/types';

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
  return (
    <Paper
      elevation={1}
      sx={{
        mt: 1,
        p: 1.5,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {toolCall.name}
      </Typography>

      <Box sx={{ mb: toolCall.result ? 1 : 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 0.5 }}
        >
          Input
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            maxHeight: 300,
            overflow: 'auto',
            bgcolor: 'background.default',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {formatJson(toolCall.input)}
        </Box>
      </Box>

      {toolCall.result !== undefined && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 0.5 }}
          >
            Result
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              maxHeight: 300,
              overflow: 'auto',
              bgcolor: 'background.default',
              borderRadius: 1,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {toolCall.result}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
