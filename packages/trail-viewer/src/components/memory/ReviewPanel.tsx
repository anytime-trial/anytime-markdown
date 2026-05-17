import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
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
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { MemoryReviewHistoryRow, MemoryUnaddressedReviewFindingRow } from '../../data/types';

const SEVERITY_COLORS: Record<string, 'default' | 'warning' | 'error' | 'info'> = {
  info: 'info',
  warn: 'warning',
  error: 'error',
};

function extractPackage(filePath: string | null): string {
  if (!filePath) return '—';
  const m = /^packages\/([^/]+)\//.exec(filePath);
  return m?.[1] ?? '—';
}

function formatReviewer(row: MemoryReviewHistoryRow): string {
  if (row.sourceKind === 'agent' || row.sourceKind === 'session') {
    return row.model ? `Claude Code (${row.model})` : 'Claude Code';
  }
  return row.reviewer.trim() || '—';
}

export interface ReviewPanelProps {
  readonly reader: MemoryReader | null;
  readonly onOpenSessionMessages?: (sessionId: string) => void;
}

export function ReviewPanel({ reader, onOpenSessionMessages }: Readonly<ReviewPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [unaddressed, setUnaddressed] = useState<readonly MemoryUnaddressedReviewFindingRow[]>([]);
  const [history, setHistory] = useState<readonly MemoryReviewHistoryRow[]>([]);
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'addressed' | 'notAddressed'>('');

  useEffect(() => {
    if (!reader) return;
    void reader.listUnaddressedReviewFindings({ daysSinceMin: 30 }).then(setUnaddressed);
    void reader.getReviewHistory({}).then(setHistory);
  }, [reader]);

  const handleSeverityChange = useCallback((e: SelectChangeEvent) => setSeverityFilter(e.target.value), []);
  const handleCategoryChange = useCallback((e: SelectChangeEvent) => setCategoryFilter(e.target.value), []);
  const handleStatusChange = useCallback((e: SelectChangeEvent) => setStatusFilter(e.target.value as '' | 'addressed' | 'notAddressed'), []);

  const categories = [...new Set(history.map((r) => r.category))].sort();

  const filteredHistory = history.filter((r) => {
    if (severityFilter && r.severity !== severityFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (statusFilter === 'addressed' && !r.addressedCommitSha) return false;
    if (statusFilter === 'notAddressed' && r.addressedCommitSha) return false;
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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>{t('memory.review.filterStatus')}</InputLabel>
          <Select value={statusFilter} label={t('memory.review.filterStatus')} onChange={handleStatusChange} sx={{ fontSize: '0.75rem' }}>
            <MenuItem value=""><em>All</em></MenuItem>
            <MenuItem value="addressed">{t('memory.review.flow.addressed')}</MenuItem>
            <MenuItem value="notAddressed">{t('memory.review.flow.notAddressed')}</MenuItem>
          </Select>
        </FormControl>
      </Box>

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
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>File</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Package</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Category</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Severity</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Finding</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Status</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Reviewed</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Reviewer</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal, p: 0.5 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredHistory.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, maxWidth: 140 }}>
                    <Tooltip title={row.targetFilePath ?? ''} placement="top">
                      <Typography variant="caption" noWrap sx={{ display: 'block' }}>
                        {row.targetFilePath?.split('/').at(-1) ?? '—'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                    {extractPackage(row.targetFilePath)}
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
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
                        <Chip label={t('memory.review.flow.addressed')} size="small" color="success" sx={{ fontSize: '0.65rem', height: 18 }} />
                        {row.addressedAt && (
                          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: colors.textSecondary, lineHeight: 1 }}>
                            {row.addressedAt.slice(0, 10)}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Chip label={t('memory.review.flow.notAddressed')} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                    {row.reviewedAt.slice(0, 10)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, maxWidth: 160 }}>
                    <Tooltip title={formatReviewer(row)} placement="top">
                      <Typography variant="caption" noWrap sx={{ display: 'block' }}>{formatReviewer(row)}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ p: 0.5 }}>
                    {onOpenSessionMessages && row.sessionId && (
                      <Tooltip title={t('memory.review.openInMessages')}>
                        <IconButton
                          size="small"
                          aria-label={t('memory.review.openInMessages')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSessionMessages(row.sessionId!);
                          }}
                          sx={{ color: colors.textSecondary, '&:hover': { color: colors.iceBlue } }}
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    </Box>
  );
}
