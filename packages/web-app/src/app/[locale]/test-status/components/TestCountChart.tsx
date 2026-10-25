import { Box, Stack, Typography } from '@mui/material';

import type { PackageTestRow } from '../../../../lib/testStatus/types';
import { ACCENT_AMBER, formatCount } from '../constants';

interface Props {
  readonly rows: readonly PackageTestRow[];
}

/**
 * パッケージ別のテスト数。CI で実行されないパッケージだけを差し色にし、どこに穴があるかを出す。
 *
 * Why not: SVG のグラフにしない。パッケージ名は長さがまちまちで、幅 400px では軸ラベルが
 * 重なる。1 行 1 パッケージの横棒なら、名前と件数が常にテキストとして読める。
 */
export default function TestCountChart({ rows }: Props) {
  const withTests = rows.filter((row) => row.tests > 0).sort((a, b) => b.tests - a.tests);
  const max = withTests[0]?.tests ?? 0;

  return (
    <Box component="section" aria-labelledby="chart-heading" sx={{ mt: 6 }}>
      <Typography id="chart-heading" variant="h5" component="h2" gutterBottom>
        パッケージ別のテスト数
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
        <Legend color="text.disabled" label="CI で実行" />
        <Legend color={ACCENT_AMBER} label="CI 外" />
      </Stack>
      <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.75 }}>
        {withTests.map((row) => (
          <Box
            component="li"
            key={row.package}
            data-testid="test-status-chart-row"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 14rem) minmax(0, 1fr) 5.5rem',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography variant="caption" noWrap title={row.package} sx={{ minWidth: 0 }}>
              {row.package}
            </Typography>
            <Box aria-hidden sx={{ height: 10, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
              <Box
                sx={{
                  height: '100%',
                  width: `${max > 0 ? (row.tests / max) * 100 : 0}%`,
                  minWidth: 2,
                  borderRadius: 1,
                  bgcolor: row.inCI ? 'text.disabled' : ACCENT_AMBER,
                }}
              />
            </Box>
            <Typography
              variant="caption"
              sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.inCI ? 'text.secondary' : 'text.primary' }}
            >
              {formatCount(row.tests)}
              {row.inCI ? '' : ' CI 外'}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function Legend({ color, label }: Readonly<{ color: string; label: string }>) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box aria-hidden sx={{ width: 12, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
    </Stack>
  );
}
