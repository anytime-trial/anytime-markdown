import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import type { TrailPromptEntry } from '../parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';

export interface PromptManagerProps {
  readonly prompts: readonly TrailPromptEntry[];
}

const PROMPT_LIST_WIDTH = 320;

export function PromptManager({
  prompts,
}: Readonly<PromptManagerProps>) {
  const { colors, codeSx } = useTrailTheme();
  const { t } = useTrailI18n();
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
          borderColor: colors.border,
          overflowY: 'auto',
        }}
      >
        <List dense disablePadding>
          {prompts.map((prompt) => (
            <ListItemButton
              key={prompt.id}
              selected={prompt.id === selectedId}
              onClick={() => setSelectedId(prompt.id)}
              sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1, '&.Mui-selected': { bgcolor: colors.iceBlueBg }, '&.Mui-selected:hover': { bgcolor: colors.iceBlueSubtle }, '&:hover': { bgcolor: colors.hoverBg } }}
            >
              <Typography variant="subtitle2" noWrap sx={{ width: '100%' }}>
                {prompt.name}
              </Typography>
              <Box
                sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}
              >
                {prompt.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ borderColor: colors.iceBlue, color: colors.iceBlue }} />
                ))}
              </Box>
              <Typography
                variant="caption"
                sx={{ mt: 0.5, color: colors.textSecondary }}
              >
                {new Date(prompt.updatedAt).toLocaleDateString()}
              </Typography>
            </ListItemButton>
          ))}
        </List>
        {prompts.length === 0 && (
          <Typography
            variant="body2"
            sx={{ p: 2, textAlign: 'center', color: colors.textSecondary }}
          >
            {t('prompt.noPrompts')}
          </Typography>
        )}
      </Box>

      {/* Right: Content preview */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {selected ? (
          <Paper
            elevation={0}
            sx={{
              ...codeSx,
              p: 2,
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
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
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              {t('prompt.selectPrompt')}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
