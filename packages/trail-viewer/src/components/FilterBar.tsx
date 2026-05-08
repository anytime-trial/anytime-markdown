import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import { useCallback, useMemo } from 'react';

import type { TrailFilter, TrailSession } from '../domain/parser/types';
import { useTrailI18n } from '../i18n';
import { useTrailTheme } from './TrailThemeContext';

interface FilterBarProps {
  readonly filter: TrailFilter;
  readonly sessions: readonly TrailSession[];
  readonly onChange: (filter: TrailFilter) => void;
}

export function FilterBar({ filter, sessions, onChange }: Readonly<FilterBarProps>) {
  const { t } = useTrailI18n();
  const { colors, radius } = useTrailTheme();

  const workspaces = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.workspace) set.add(s.workspace);
    }
    return [...set].sort();
  }, [sessions]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filter, searchText: e.target.value || undefined });
    },
    [filter, onChange],
  );

  const handleSearchClear = useCallback(() => {
    onChange({ ...filter, searchText: undefined });
  }, [filter, onChange]);

  const handleWorkspaceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onChange({ ...filter, workspace: value ? value : undefined });
    },
    [filter, onChange],
  );

  return (
    <Toolbar
      variant="dense"
      sx={{
        gap: 1,
        borderBottom: 1,
        borderColor: colors.border,
        bgcolor: colors.midnightNavy,
        flexWrap: 'wrap',
        minHeight: 56,
      }}
    >
      <TextField
        size="small"
        label={t('filter.searchLabel')}
        placeholder={t('filter.searchPlaceholder')}
        value={filter.searchText ?? ''}
        onChange={handleSearchChange}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16, color: colors.textSecondary }} />
              </InputAdornment>
            ),
            endAdornment: filter.searchText ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label={t('filter.searchClear')}
                  onClick={handleSearchClear}
                  sx={{ p: 0.25, color: colors.textSecondary }}
                >
                  <ClearIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
          inputLabel: { sx: { fontSize: '0.75rem' } },
        }}
        sx={{
          minWidth: 200,
          '& .MuiOutlinedInput-root': {
            fontSize: '0.75rem',
            borderRadius: radius.md,
            '& fieldset': { borderColor: colors.border },
            '&:hover fieldset': { borderColor: colors.textSecondary },
            '&.Mui-focused fieldset': { borderColor: colors.iceBlue },
          },
          '& .MuiOutlinedInput-input': { py: 0.5 },
          '& .MuiInputLabel-root': { color: colors.textSecondary },
          '& .MuiInputLabel-root.Mui-focused': { color: colors.iceBlue },
        }}
      />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          select
          size="small"
          label={t('filter.workspace')}
          value={filter.workspace ?? ''}
          onChange={handleWorkspaceChange}
          slotProps={{ inputLabel: { sx: { fontSize: '0.75rem' } } }}
          sx={{
            minWidth: 200,
            '& .MuiOutlinedInput-root': { fontSize: '0.75rem', height: 30 },
            '& .MuiSelect-select': { py: '3px' },
          }}
        >
          <MenuItem value="" sx={{ fontSize: '0.75rem' }}>
            All
          </MenuItem>
          {workspaces.map((w) => (
            <MenuItem key={w} value={w} sx={{ fontSize: '0.75rem' }}>
              {w}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    </Toolbar>
  );
}
