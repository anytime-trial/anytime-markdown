import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTrailI18n } from '../../i18n';
import { useTrailTheme } from '../TrailThemeContext';
import { PipelineRunsTimeline } from './PipelineRunsTimeline';
import { TopEntitiesTable } from './TopEntitiesTable';
import type { MemoryReader } from '../../data/readers/MemoryReader';
import type { MemoryFailedItemRow, MemoryInvalidationRow, MemoryPipelineRunRow, MemoryTopEntityRow } from '../../data/types';

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  running: 'info',
  success: 'success',
  partial: 'warning',
  error: 'error',
};

export interface PipelineRunsPanelProps {
  readonly reader: MemoryReader | null;
}

export function PipelineRunsPanel({ reader }: Readonly<PipelineRunsPanelProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();
  const [runs, setRuns] = useState<readonly MemoryPipelineRunRow[]>([]);
  const [entities, setEntities] = useState<readonly MemoryTopEntityRow[]>([]);
  const [invalidations, setInvalidations] = useState<readonly MemoryInvalidationRow[]>([]);
  const [failedItems, setFailedItems] = useState<readonly MemoryFailedItemRow[]>([]);

  useEffect(() => {
    if (!reader) return;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    void reader.listPipelineRuns({ since, limit: 200 }).then(setRuns);
    void reader.listTopEntities({ limit: 20 }).then(setEntities);
    void reader.listInvalidations({ limit: 50 }).then(setInvalidations);
    void reader.listFailedItems({ limit: 50 }).then(setFailedItems);
  }, [reader]);

  if (!reader) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>{t('memory.runs.empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', ...scrollbarSx }}>
      {/* Section 1: Pipeline timeline */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: colors.border }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
          {t('memory.runs.timeline')}
        </Typography>
        <PipelineRunsTimeline runs={runs} />
      </Box>

      {/* Section 2: Top entities */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: colors.border }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
          {t('memory.runs.topEntities')}
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <TopEntitiesTable entities={entities} />
        </Box>
      </Box>

      {/* Section 3: Invalidations */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: colors.border }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
          {t('memory.runs.invalidations')}
        </Typography>
        {invalidations.length === 0 ? (
          <Typography variant="caption" display="block" sx={{ color: colors.textSecondary, mt: 0.5 }}>—</Typography>
        ) : (
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', p: '2px 8px' }}>Date</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', p: '2px 8px' }}>Reason</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', p: '2px 8px' }}>Superseded by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invalidations.map((inv) => (
                <TableRow key={inv.id} hover>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, whiteSpace: 'nowrap', p: '2px 8px' }}>
                    {inv.invalidatedAt.slice(0, 10)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textPrimary, p: '2px 8px' }}>{inv.reason}</TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, fontFamily: 'monospace', p: '2px 8px' }}>
                    {inv.supersedingEdgeId?.slice(0, 8) ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Section 4: Failed items */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
          {t('memory.runs.failedItems')}
        </Typography>
        {failedItems.length === 0 ? (
          <Typography variant="caption" display="block" sx={{ color: colors.textSecondary, mt: 0.5 }}>—</Typography>
        ) : (
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', p: '2px 8px' }}>Scope</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', p: '2px 8px' }}>Key</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', p: '2px 8px' }}>Attempts</TableCell>
                <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', p: '2px 8px' }}>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {failedItems.map((item) => (
                <TableRow key={`${item.scope}:${item.itemKey}`} hover>
                  <TableCell sx={{ p: '2px 8px' }}>
                    <Chip label={item.scope} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, maxWidth: 180, p: '2px 8px' }}>
                    <Typography variant="caption" noWrap sx={{ display: 'block' }}>{item.itemKey}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: STATUS_COLORS['error'] === 'error' ? colors.textPrimary : colors.textSecondary, p: '2px 8px' }}>
                    {item.attemptCount}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, maxWidth: 200, p: '2px 8px' }}>
                    <Typography variant="caption" noWrap sx={{ display: 'block' }}>{item.reason}</Typography>
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
