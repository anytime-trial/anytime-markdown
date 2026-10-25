'use client';

import { Box, Container, Divider, Link, Stack, Typography } from '@mui/material';

import { buildTakeaway, summarize } from '../../../lib/testStatus/summarize';
import type { MeansDataset, TestStatusSnapshot } from '../../../lib/testStatus/types';
import CoverageSmellList from './components/CoverageSmellList';
import MeansTable from './components/MeansTable';
import PackageTable from './components/PackageTable';
import TestCountChart from './components/TestCountChart';
import { formatCount, formatRunAt } from './constants';

interface Props {
  readonly snapshot: TestStatusSnapshot;
  readonly means: MeansDataset;
}

const REPO_COMMIT_URL = 'https://github.com/anytime-trial/anytime-markdown/commit/';

export default function TestStatusBody({ snapshot, means }: Props) {
  const summary = summarize(snapshot.rows);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <Box component="header" sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          テスト実施状況
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: '60ch', lineHeight: 1.8 }} data-testid="test-status-takeaway">
          {buildTakeaway(summary)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {`${formatRunAt(snapshot.runAt)} に全パッケージのユニットテストを実行した結果です。対象コミット: `}
          <Link href={`${REPO_COMMIT_URL}${snapshot.commit}`} target="_blank" rel="noopener noreferrer">
            {snapshot.commit}
          </Link>
        </Typography>
      </Box>

      <Stack
        direction="row"
        spacing={{ xs: 2, sm: 4 }}
        sx={{ mt: 3, mb: 3, flexWrap: 'wrap' }}
        useFlexGap
        component="dl"
        data-testid="test-status-stats"
      >
        <Stat label="テスト" value={`${formatCount(summary.totalTests)} 件`} />
        <Stat label="失敗" value={`${formatCount(summary.failed)} 件`} />
        <Stat label="CI で実行されないテスト" value={`${formatCount(summary.testsOutsideCI)} 件`} />
        <Stat label="テストのあるパッケージ" value={`${summary.packagesWithTests}`} />
        <Stat label="テストのないパッケージ" value={`${summary.packagesWithoutTests}`} />
      </Stack>

      <Divider />

      <MeansTable means={means} />
      <TestCountChart rows={snapshot.rows} />
      <PackageTable rows={snapshot.rows} />
      <CoverageSmellList rows={snapshot.rows} />
    </Container>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Box>
      <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography component="dd" variant="h6" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}
