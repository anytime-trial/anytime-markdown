import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { TrailPromptEntry } from '../parser/types';

export interface PromptManagerProps {
  readonly prompts: readonly TrailPromptEntry[];
  readonly isDark?: boolean;
}

const PROMPT_LIST_WIDTH = 320;

export function PromptManager({
  prompts,
  isDark,
}: Readonly<PromptManagerProps>) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const selected = prompts.find((p) => p.id === selectedId);

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left: Prompt list */}
      <Box
        sx={{
          width: PROMPT_LIST_WIDTH,
          minWidth: PROMPT_LIST_WIDTH,
          borderRight: 1,
          borderColor: 'divider',
          overflowY: 'auto',
        }}
      >
        <List dense disablePadding>
          {prompts.map((prompt) => (
            <ListItemButton
              key={prompt.id}
              selected={prompt.id === selectedId}
              onClick={() => setSelectedId(prompt.id)}
              sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}
            >
              <Typography variant="subtitle2" noWrap sx={{ width: '100%' }}>
                {prompt.name}
              </Typography>
              <Box
                sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}
              >
                {prompt.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                v{prompt.version} &middot;{' '}
                {new Date(prompt.updatedAt).toLocaleDateString()}
              </Typography>
            </ListItemButton>
          ))}
        </List>
        {prompts.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ p: 2, textAlign: 'center' }}
          >
            No prompts found
          </Typography>
        )}
      </Box>

      {/* Right: Content preview */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {selected ? (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              backgroundColor: isDark ? 'grey.900' : 'grey.50',
              minHeight: '100%',
            }}
          >
            {selected.content}
          </Paper>
        ) : (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Select a prompt to view
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
