import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import { useCallback, useMemo } from 'react';

import type { TrailFilter, TrailSession } from '../parser/types';
import { useTrailTheme } from './TrailThemeContext';

interface FilterBarProps {
  readonly filter: TrailFilter;
  readonly sessions: readonly TrailSession[];
  readonly onChange: (filter: TrailFilter) => void;
}

const ALL_VALUE = '__all__';

export function FilterBar({ filter, sessions, onChange }: Readonly<FilterBarProps>) {
  const { colors, radius } = useTrailTheme();
  const branches = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.gitBranch) set.add(s.gitBranch);
    }
    return [...set].sort();
  }, [sessions]);

  const models = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.model) set.add(s.model);
    }
    return [...set].sort();
  }, [sessions]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filter, searchText: e.target.value || undefined });
    },
    [filter, onChange],
  );

  const handleBranchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onChange({ ...filter, gitBranch: value === ALL_VALUE ? undefined : value });
    },
    [filter, onChange],
  );

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onChange({ ...filter, model: value === ALL_VALUE ? undefined : value });
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
        minHeight: 48,
      }}
    >
      <TextField
        size="small"
        placeholder="Search..."
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
          label="Branch"
          value={filter.gitBranch ?? ALL_VALUE}
          onChange={handleBranchChange}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value={ALL_VALUE}>All branches</MenuItem>
          {branches.map((b) => (
            <MenuItem key={b} value={b}>
              {b}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Model"
          value={filter.model ?? ALL_VALUE}
          onChange={handleModelChange}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value={ALL_VALUE}>All models</MenuItem>
          {models.map((m) => (
            <MenuItem key={m} value={m}>
              {m}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    </Toolbar>
  );
}
