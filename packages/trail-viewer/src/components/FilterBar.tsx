import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import { useCallback, useEffect, useMemo } from 'react';

import type { TrailFilter, TrailSession } from '../parser/types';
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

  const repositories = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.project) set.add(s.project);
    }
    return [...set].sort();
  }, [sessions]);

  useEffect(() => {
    if (!filter.project && repositories.length > 0) {
      onChange({ ...filter, project: repositories[0] });
    }
  }, [filter, repositories, onChange]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filter, searchText: e.target.value || undefined });
    },
    [filter, onChange],
  );

  const handleRepositoryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filter, project: e.target.value });
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
                <SearchIcon fontSize="small" sx={{ color: colors.textSecondary }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{
          minWidth: 200,
          '& .MuiOutlinedInput-root': {
            borderRadius: radius.md,
            '& fieldset': { borderColor: colors.border },
            '&:hover fieldset': { borderColor: colors.textSecondary },
            '&.Mui-focused fieldset': { borderColor: colors.iceBlue },
          },
          '& .MuiInputLabel-root': { color: colors.textSecondary },
          '& .MuiInputLabel-root.Mui-focused': { color: colors.iceBlue },
        }}
      />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          select
          size="small"
          label={t('filter.repository')}
          value={filter.project ?? ''}
          onChange={handleRepositoryChange}
          sx={{ minWidth: 200 }}
        >
          {repositories.map((r) => (
            <MenuItem key={r} value={r}>
              {r}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    </Toolbar>
  );
}
