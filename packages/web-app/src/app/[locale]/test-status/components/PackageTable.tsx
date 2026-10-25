'use client';

import {
  Box,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';

import { filterRows, sortRows } from '../../../../lib/testStatus/summarize';
import type { PackageTestRow, SortDirection, SortKey } from '../../../../lib/testStatus/types';
import { formatCount, PACKAGE_COLUMNS, RESULT_META } from '../constants';
import StateChip from './StateChip';

interface Props {
  readonly rows: readonly PackageTestRow[];
}

/** 数値の列は大きい順から見たいことが多いので、初回クリックの向きを列の型で変える */
function initialDirection(numeric: boolean): SortDirection {
  return numeric ? 'desc' : 'asc';
}

export default function PackageTable({ rows }: Props) {
  const [outsideCIOnly, setOutsideCIOnly] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('tests');
  const [direction, setDirection] = useState<SortDirection>('desc');

  const visible = useMemo(
    () => sortRows(filterRows(rows, { outsideCIOnly, failedOnly }), sortKey, direction),
    [rows, outsideCIOnly, failedOnly, sortKey, direction],
  );

  const onSort = (key: SortKey, numeric: boolean) => {
    if (key === sortKey) {
      setDirection(direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setDirection(initialDirection(numeric));
  };

  return (
    <Box component="section" aria-labelledby="packages-heading" sx={{ mt: 6 }}>
      <Typography id="packages-heading" variant="h5" component="h2" gutterBottom>
        パッケージ別の実行結果
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 2 }}>
        <FormControlLabel
          control={<Switch size="small" checked={outsideCIOnly} onChange={(e) => setOutsideCIOnly(e.target.checked)} />}
          label="CI 外のみ"
        />
        <FormControlLabel
          control={<Switch size="small" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />}
          label="失敗のみ"
        />
      </Stack>
      <Box role="status" aria-live="polite" aria-atomic="true" sx={{ my: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {`${visible.length} パッケージを表示しています。`}
        </Typography>
      </Box>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-labelledby="packages-heading">
          <TableHead>
            <TableRow>
              {PACKAGE_COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  scope="col"
                  align={column.numeric ? 'right' : 'left'}
                  sortDirection={sortKey === column.key ? direction : false}
                >
                  <TableSortLabel
                    active={sortKey === column.key}
                    direction={sortKey === column.key ? direction : initialDirection(column.numeric)}
                    onClick={() => onSort(column.key, column.numeric)}
                  >
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell scope="col">CI</TableCell>
              <TableCell scope="col">結果</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.package} data-testid="test-status-package-row">
                <TableCell component="th" scope="row" sx={{ whiteSpace: 'nowrap' }}>
                  {row.package}
                </TableCell>
                <NumberCell value={row.tests} />
                <NumberCell value={row.failed} />
                <NumberCell value={row.skipped} />
                <NumberCell value={row.durationSec} />
                <NumberCell value={row.fixes90d} />
                <NumberCell value={row.coverageNamed} />
                <NumberCell value={row.weak} />
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.inCI ? '実行' : 'なし'}</TableCell>
                <TableCell>
                  <StateChip meta={RESULT_META[row.result]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function NumberCell({ value }: Readonly<{ value: number }>) {
  return (
    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatCount(value)}
    </TableCell>
  );
}
