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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { ReviewToBugFlow } from './ReviewToBugFlow';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { MemoryReviewHistoryRow, MemoryUnaddressedReviewFindingRow } from '../../data/types';

const SEVERITY_COLORS: Record<string, 'default' | 'warning' | 'error' | 'info'> = {
  info: 'info',
  warn: 'warning',
  error: 'error',
};

export interface ReviewPanelProps {
  readonly reader: MemoryReader | null;
}

export function ReviewPanel({ reader }: Readonly<ReviewPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [unaddressed, setUnaddressed] = useState<readonly MemoryUnaddressedReviewFindingRow[]>([]);
  const [history, setHistory] = useState<readonly MemoryReviewHistoryRow[]>([]);
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedFinding, setSelectedFinding] = useState<MemoryReviewHistoryRow | null>(null);

  useEffect(() => {
    if (!reader) return;
    void reader.listUnaddressedReviewFindings({ daysSinceMin: 30 }).then(setUnaddressed);
    void reader.getReviewHistory({}).then(setHistory);
  }, [reader]);

  const handleSeverityChange = useCallback((e: SelectChangeEvent) => setSeverityFilter(e.target.value), []);
  const handleCategoryChange = useCallback((e: SelectChangeEvent) => setCategoryFilter(e.target.value), []);

  const categories = [...new Set(history.map((r) => r.category))].sort();

  const filteredHistory = history.filter((r) => {
    if (severityFilter && r.severity !== severityFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    return true;
  });

  if (!reader) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.review.empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Unaddressed findings summary */}
      {unaddressed.length > 0 && (
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: colors.border }}>
          <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
            {t('memory.review.unaddressed')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            {(['error', 'warn', 'info'] as const).map((sev) => {
              const count = unaddressed.filter((r) => r.severity === sev).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={sev}
                  label={`${sev}: ${count}`}
                  size="small"
                  color={SEVERITY_COLORS[sev] ?? 'default'}
                  sx={{ fontSize: '0.65rem', height: 20 }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* Filter bar */}
      <Box sx={{ px: 2, py: 1, display: 'flex', gap: 2, alignItems: 'center', borderBottom: 1, borderColor: colors.border }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
          {t('memory.review.history')}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>{t('memory.review.filterSeverity')}</InputLabel>
          <Select value={severityFilter} label={t('memory.review.filterSeverity')} onChange={handleSeverityChange} sx={{ fontSize: '0.75rem' }}>
            <MenuItem value=""><em>All</em></MenuItem>
            <MenuItem value="error">error</MenuItem>
            <MenuItem value="warn">warn</MenuItem>
            <MenuItem value="info">info</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>{t('memory.review.filterCategory')}</InputLabel>
          <Select value={categoryFilter} label={t('memory.review.filterCategory')} onChange={handleCategoryChange} sx={{ fontSize: '0.75rem' }}>
            <MenuItem value=""><em>All</em></MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {/* Main: table + flow panel */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Review history table */}
        <Box sx={{ flex: 1, overflow: 'auto', ...scrollbarSx }}>
          {filteredHistory.length === 0 ? (
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.review.empty')}</Typography>
            </Box>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>File</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Category</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Severity</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Finding</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredHistory.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    selected={selectedFinding?.id === row.id}
                    onClick={() => setSelectedFinding(selectedFinding?.id === row.id ? null : row)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, maxWidth: 140 }}>
                      <Tooltip title={row.targetFilePath ?? ''} placement="top">
                        <Typography variant="caption" noWrap sx={{ display: 'block' }}>
                          {row.targetFilePath?.split('/').at(-1) ?? '—'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip label={row.category} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.severity}
                        color={SEVERITY_COLORS[row.severity] ?? 'default'}
                        size="small"
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: colors.textPrimary, maxWidth: 280 }}>
                      <Tooltip title={row.findingText} placement="top">
                        <Typography variant="caption" noWrap sx={{ display: 'block' }}>
                          {row.findingText}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {row.addressedCommitSha ? (
                        <Chip label={t('memory.review.flow.addressed')} size="small" color="success" sx={{ fontSize: '0.65rem', height: 18 }} />
                      ) : (
                        <Chip label={t('memory.review.flow.notAddressed')} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>

        {/* Review → Finding → Bug flow */}
        <Box sx={{ width: 260, flexShrink: 0, borderLeft: 1, borderColor: colors.border, overflow: 'auto', ...scrollbarSx }}>
          <ReviewToBugFlow finding={selectedFinding} />
        </Box>
      </Box>
    </Box>
  );
}
