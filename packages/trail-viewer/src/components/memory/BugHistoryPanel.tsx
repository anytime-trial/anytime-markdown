import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { BugCausedByGraph } from './BugCausedByGraph';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { MemoryBugHistoryRow, MemoryRecurringBugRow } from '../../data/types';

const CATEGORY_COLORS: Record<string, 'default' | 'error' | 'warning' | 'info' | 'success'> = {
  regression: 'error',
  spec: 'info',
  logic: 'warning',
  typo: 'default',
  deps: 'default',
};

export interface BugHistoryPanelProps {
  readonly reader: MemoryReader | null;
  readonly isDark?: boolean;
}

export function BugHistoryPanel({ reader, isDark = true }: Readonly<BugHistoryPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [recurring, setRecurring] = useState<readonly MemoryRecurringBugRow[]>([]);
  const [history, setHistory] = useState<readonly MemoryBugHistoryRow[]>([]);
  const [pkgFilter, setPkgFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedBugs, setSelectedBugs] = useState<readonly MemoryBugHistoryRow[]>([]);

  useEffect(() => {
    if (!reader) return;
    void reader.listRecurringBugs({}).then(setRecurring);
    void reader.getBugHistory({}).then(setHistory);
  }, [reader]);

  const handlePkgChange = useCallback((e: SelectChangeEvent) => setPkgFilter(e.target.value), []);
  const handleCategoryChange = useCallback((e: SelectChangeEvent) => setCategoryFilter(e.target.value), []);

  const packages = [...new Set(history.map((r) => r.package))].sort();
  const categories = [...new Set(history.map((r) => r.category))].sort();

  const filteredHistory = history.filter((r) => {
    if (pkgFilter && r.package !== pkgFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    return true;
  });

  const handleRowClick = useCallback((row: MemoryBugHistoryRow) => {
    const bugs = history.filter((r) => r.bugEntityId === row.bugEntityId);
    setSelectedBugs(bugs);
  }, [history]);

  if (!reader) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.bug.empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Recurring section */}
      {recurring.length > 0 && (
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: colors.border }}>
          <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
            {t('memory.bug.recurring')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {recurring.slice(0, 10).map((r) => (
              <Chip
                key={r.id}
                label={r.subjectDisplayName || r.subjectEntityId}
                size="small"
                color={CATEGORY_COLORS[r.driftType] ?? 'default'}
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Filter bar */}
      <Box sx={{ px: 2, py: 1, display: 'flex', gap: 2, alignItems: 'center', borderBottom: 1, borderColor: colors.border }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
          {t('memory.bug.history')}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>{t('memory.bug.filterPackage')}</InputLabel>
          <Select value={pkgFilter} label={t('memory.bug.filterPackage')} onChange={handlePkgChange} sx={{ fontSize: '0.75rem' }}>
            <MenuItem value=""><em>All</em></MenuItem>
            {packages.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>{t('memory.bug.filterCategory')}</InputLabel>
          <Select value={categoryFilter} label={t('memory.bug.filterCategory')} onChange={handleCategoryChange} sx={{ fontSize: '0.75rem' }}>
            <MenuItem value=""><em>All</em></MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Main content: table + graph side by side */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Bug table */}
        <Box sx={{ flex: 1, overflow: 'auto', ...scrollbarSx }}>
          {filteredHistory.length === 0 ? (
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.bug.empty')}</Typography>
            </Box>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Package</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Category</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Commit</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Summary</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredHistory.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={() => handleRowClick(row)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary }}>{row.package}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.category}
                        color={CATEGORY_COLORS[row.category] ?? 'default'}
                        size="small"
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, fontFamily: 'monospace' }}>
                      {row.commitSha.slice(0, 7)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: colors.textPrimary, maxWidth: 280 }}>
                      <Typography variant="caption" noWrap sx={{ display: 'block' }}>
                        {row.subjectSummary}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                      {row.committedAt.slice(0, 10)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>

        {/* caused_by graph */}
        <Box sx={{ width: 280, flexShrink: 0, borderLeft: 1, borderColor: colors.border, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="caption" sx={{ color: colors.textSecondary, px: 1.5, py: 0.75, borderBottom: 1, borderColor: colors.border }}>
            {t('memory.bug.causedBy.title')}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <BugCausedByGraph bugs={selectedBugs} isDark={isDark} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
