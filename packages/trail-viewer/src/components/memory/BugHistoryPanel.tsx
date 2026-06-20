import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, FormControl, IconButton, InputLabel, MenuItem, Select, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography, OpenInNew as OpenInNewIcon } from '../../ui';
import type { SelectChangeEvent } from '../../ui';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { BugCausalPanel } from './BugCausalPanel';
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
  readonly onOpenSessionMessages?: (sessionId: string) => void;
  readonly onOpenPrecedingReviews?: (findingIds: readonly string[]) => void;
  readonly onOpenSiblingBugs?: (bugEntityIds: readonly string[]) => void;
  readonly pendingBugFilter?: { bugEntityIds: readonly string[] } | null;
  readonly onConsumePendingBugFilter?: () => void;
}

export function BugHistoryPanel({
  reader,
  isDark = true,
  onOpenSessionMessages,
  onOpenPrecedingReviews,
  onOpenSiblingBugs,
  pendingBugFilter,
  onConsumePendingBugFilter,
}: Readonly<BugHistoryPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [recurring, setRecurring] = useState<readonly MemoryRecurringBugRow[]>([]);
  const [history, setHistory] = useState<readonly MemoryBugHistoryRow[]>([]);
  const [pkgFilter, setPkgFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedBugEntityId, setSelectedBugEntityId] = useState<string | null>(null);

  useEffect(() => {
    if (!reader) return;
    void reader.listRecurringBugs({}).then(setRecurring);
    void reader.getBugHistory({}).then(setHistory);
  }, [reader]);

  const handlePkgChange = useCallback((e: SelectChangeEvent) => setPkgFilter(e.target.value), []);
  const handleCategoryChange = useCallback((e: SelectChangeEvent) => setCategoryFilter(e.target.value), []);

  const packages = [...new Set(history.map((r) => r.package))].sort();
  const categories = [...new Set(history.map((r) => r.category))].sort();

  const pendingIds = pendingBugFilter?.bugEntityIds ?? null;
  const filteredHistory = history.filter((r) => {
    if (pendingIds && !pendingIds.includes(r.bugEntityId)) return false;
    if (pkgFilter && r.package !== pkgFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    return true;
  });

  const handleRowClick = useCallback((row: MemoryBugHistoryRow) => {
    setSelectedBugEntityId((prev) => (prev === row.bugEntityId ? null : row.bugEntityId));
  }, []);

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
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Package</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Category</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Commit</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Summary</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal }}>Date</TableCell>
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal, p: 0.5 }} />
                  <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: colors.charcoal, p: 0.5 }} />
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
                    <TableCell align="right" sx={{ p: 0.5 }}>
                      {onOpenSessionMessages && row.sessionId && (
                        <Tooltip title={t('memory.bug.openInMessages')}>
                          <IconButton
                            size="small"
                            aria-label={t('memory.bug.openInMessages')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenSessionMessages(row.sessionId!);
                            }}
                            sx={{ color: colors.textSecondary /* TODO(mui-removal): dropped pseudo sx '&:hover' */ }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ p: 0.5, whiteSpace: 'nowrap' }}>
                      {row.precededByFindingIds.length > 0 && (
                        <Tooltip title={`${t('memory.bug.precededByCount')}: ${row.precededByFindingIds.length}`}>
                          <Chip
                            label={`↩ ${row.precededByFindingIds.length}`}
                            size="small"
                            color="info"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPrecedingReviews?.(row.precededByFindingIds);
                            }}
                            sx={{ fontSize: '0.65rem', height: 18, cursor: onOpenPrecedingReviews ? 'pointer' : 'default' }}
                          />
                        </Tooltip>
                      )}
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
            <BugCausalPanel
              reader={reader}
              bugEntityId={selectedBugEntityId}
              onOpenPrecedingReviews={onOpenPrecedingReviews}
              onOpenSiblingBugs={onOpenSiblingBugs}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
