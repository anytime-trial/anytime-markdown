import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import type { MeansDataset } from '../../../../lib/testStatus/types';
import { MEANS_STATE_META } from '../constants';
import StateChip from './StateChip';

/** テスト実施の指針 §11 の手段ごとの実施状況。行の順序は指針の一覧（必要度が高く安い順）に従う */
export default function MeansTable({ means }: Readonly<{ means: MeansDataset }>) {
  return (
    <Box component="section" aria-labelledby="means-heading" sx={{ mt: 6 }}>
      <Typography id="means-heading" variant="h5" component="h2" gutterBottom>
        手段別の実施状況
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '60ch', lineHeight: 1.8, mb: 2 }}>
        {`テスト実施の指針 §11 の各手段を、${means.evaluatedAt} の評価に基づいて判定したものです。`}
      </Typography>
      <TableContainer sx={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-labelledby="means-heading">
        <Table size="small" aria-labelledby="means-heading">
          <TableHead>
            <TableRow>
              <TableCell scope="col">手段</TableCell>
              <TableCell scope="col">節</TableCell>
              <TableCell scope="col">実施コスト</TableCell>
              <TableCell scope="col">必要度</TableCell>
              <TableCell scope="col">状態</TableCell>
              <TableCell scope="col" sx={{ minWidth: '24ch' }}>
                根拠
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {means.rows.map((row) => (
              <TableRow key={row.id} data-testid={`test-status-means-${row.id}`}>
                <TableCell component="th" scope="row">
                  {row.name}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.section}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.cost}</TableCell>
                <TableCell>{row.need}</TableCell>
                <TableCell>
                  <StateChip meta={MEANS_STATE_META[row.state]} />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{row.basis}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
