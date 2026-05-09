import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
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
import { DriftDetailDialog } from './DriftDetailDialog';
import { filterDriftRows } from './driftFilter';
import type { MemoryDriftEventRow } from '../../data/types';

const SEVERITY_COLORS: Record<string, 'default' | 'warning' | 'error'> = {
  info: 'default',
  warn: 'warning',
  error: 'error',
};

export interface DriftPanelProps {
  readonly rows: readonly MemoryDriftEventRow[];
  readonly onResolve: (id: string, note: string) => Promise<void>;
  readonly onLoadDetail: (id: string) => Promise<unknown>;
}

export function DriftPanel({ rows, onResolve, onLoadDetail }: Readonly<DriftPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = filterDriftRows(rows, { unresolvedOnly, severityFilter, typeFilter });

  const driftTypes = [...new Set(rows.map((r) => r.driftType))].sort();

  const handleSeverityChange = useCallback((e: SelectChangeEvent) => setSeverityFilter(e.target.value), []);
  const handleTypeChange = useCallback((e: SelectChangeEvent) => setTypeFilter(e.target.value), []);

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.drift.empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', borderBottom: 1, borderColor: colors.border }}>
        <FormControlLabel
          control={
            <Switch
              checked={unresolvedOnly}
              onChange={(e) => setUnresolvedOnly(e.target.checked)}
              size="small"
              aria-label={t('memory.drift.unresolvedOnly')}
            />
          }
          label={<Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('memory.drift.unresolvedOnly')}</Typography>}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>{t('memory.drift.filterSeverity')}</InputLabel>
          <Select value={severityFilter} label={t('memory.drift.filterSeverity')} onChange={handleSeverityChange} sx={{ fontSize: '0.75rem' }}>
            <MenuItem value=""><em>All</em></MenuItem>
            <MenuItem value="info">{t('memory.drift.severity.info')}</MenuItem>
            <MenuItem value="warn">{t('memory.drift.severity.warn')}</MenuItem>
            <MenuItem value="error">{t('memory.drift.severity.error')}</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>{t('memory.drift.filterType')}</InputLabel>
          <Select value={typeFilter} label={t('memory.drift.filterType')} onChange={handleTypeChange} sx={{ fontSize: '0.75rem' }}>
            <MenuItem value=""><em>All</em></MenuItem>
            {driftTypes.map((dt) => <MenuItem key={dt} value={dt}>{dt}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', ...scrollbarSx }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Subject</TableCell>
              <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Type</TableCell>
              <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>{t('memory.drift.filterSeverity')}</TableCell>
              <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Detected</TableCell>
              <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ fontSize: '0.75rem', color: colors.textPrimary, maxWidth: 200 }}>
                  <Tooltip title={row.subjectEntityId} placement="top">
                    <Typography variant="caption" noWrap sx={{ display: 'block' }}>
                      {row.subjectDisplayName || row.subjectEntityId}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary }}>{row.driftType}</TableCell>
                <TableCell>
                  <Chip
                    label={row.severity}
                    color={SEVERITY_COLORS[row.severity] ?? 'default'}
                    size="small"
                    sx={{ fontSize: '0.65rem', height: 18 }}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                  {row.detectedAt.slice(0, 10)}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {row.resolvedAt ? (
                    <Chip label={t('memory.drift.resolved')} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                  ) : (
                    <Button size="small" sx={{ fontSize: '0.65rem', py: 0, minWidth: 0, color: colors.iceBlue }} onClick={() => setDetailId(row.id)}>
                      {t('memory.drift.detail')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {detailId !== null && (
        <DriftDetailDialog
          eventId={detailId}
          onClose={() => setDetailId(null)}
          onResolve={onResolve}
          onLoadDetail={onLoadDetail}
        />
      )}
    </Box>
  );
}
