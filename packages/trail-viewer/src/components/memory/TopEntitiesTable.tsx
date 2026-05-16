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
import type { MemoryTopEntityRow } from '../../data/types';

export interface TopEntitiesTableProps {
  readonly entities: readonly MemoryTopEntityRow[];
}

export function TopEntitiesTable({ entities }: Readonly<TopEntitiesTableProps>) {
  const { t } = useTrailI18n();
  const { colors, scrollbarSx } = useTrailTheme();

  if (entities.length === 0) {
    return (
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>{t('memory.runs.empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ overflow: 'auto', ...scrollbarSx }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Type</TableCell>
            <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Name</TableCell>
            <TableCell sx={{ color: colors.textSecondary, fontSize: '0.7rem', bgcolor: 'transparent' }}>Updated</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entities.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell>
                <Chip label={row.type} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
              </TableCell>
              <TableCell sx={{ fontSize: '0.75rem', color: colors.textPrimary, maxWidth: 280 }}>
                <Typography variant="caption" noWrap sx={{ display: 'block' }}>
                  {row.displayName || row.canonicalName}
                </Typography>
              </TableCell>
              <TableCell sx={{ fontSize: '0.7rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                {row.lastUpdatedAt.slice(0, 10)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
