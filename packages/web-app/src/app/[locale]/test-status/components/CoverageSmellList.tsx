import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { rankCoverageSmells } from '../../../../lib/testStatus/summarize';
import type { PackageTestRow } from '../../../../lib/testStatus/types';
import { formatCount, formatPercent } from '../constants';

const TOP = 10;

/** 指針 §10.4.3 の兆候（カバレッジのために分けたファイル・実行しただけを確かめる検証）が多いパッケージ */
export default function CoverageSmellList({ rows }: Readonly<{ rows: readonly PackageTestRow[] }>) {
  const ranked = rankCoverageSmells(rows).slice(0, TOP);

  return (
    <Box component="section" aria-labelledby="smells-heading" sx={{ mt: 6 }}>
      <Typography id="smells-heading" variant="h5" component="h2" gutterBottom>
        カバレッジ目的のテストの兆候
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '60ch', lineHeight: 1.8, mb: 2 }}>
        {
          'ファイル名に coverage・additional・extra を含むテストファイルの数と、toBeDefined()・toBeTruthy()・not.toThrow() だけで確かめる弱い検証の割合です。数値を減らすこと自体を目標にせず、対象モジュールを変更する機会に振る舞い別のテストへまとめます（指針 §10.4）。'
        }
      </Typography>
      {ranked.length === 0 ? (
        <Typography variant="body2">兆候のあるパッケージはありません。</Typography>
      ) : (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-labelledby="smells-heading">
            <TableHead>
              <TableRow>
                <TableCell scope="col">パッケージ</TableCell>
                <TableCell scope="col" align="right">
                  カバレッジ目的のファイル
                </TableCell>
                <TableCell scope="col" align="right">
                  弱い検証
                </TableCell>
                <TableCell scope="col" align="right">
                  expect に占める割合
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ranked.map((row) => (
                <TableRow key={row.package} data-testid="test-status-smell-row">
                  <TableCell component="th" scope="row">
                    {row.package}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatCount(row.coverageNamed)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatCount(row.weak)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatPercent(row.weakRatio)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
