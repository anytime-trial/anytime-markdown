import { Container } from '@mui/material';
import type { Metadata } from 'next';

import {
  INSIGHT_ENTRIES,
  INSIGHT_PERIOD,
  INSIGHT_SOURCE_REPORT_COUNT,
  INSIGHT_THEMES,
} from '../../../lib/insightTimeline/data';
import { buildSingleSourceAlternates } from '../../../lib/localeAlternates';
import {
  RELEASE_ENTRIES,
  RELEASE_PERIOD,
  RELEASE_SOURCE_REPORT_COUNT,
} from '../../../lib/releaseTimeline/data';
import { socialTitle } from '../../../lib/siteMetadata';
import LandingHeader from '../components/LandingHeader';
import InsightTrack from './components/InsightTrack';
import TimelineBody from './TimelineBody';

const TITLE = 'Claude Code 年表';
const DESCRIPTION =
  '日次・週次の技術調査レポートが観測した Claude Code のリリースと、テーマごとに束ねた知見の経緯をまとめた年表。| A timeline of Claude Code releases and the themed history of insights observed in daily and weekly technical research reports.';

// 本文が日本語のみ（i18n メッセージを使っていない）ため、en 版があるとは申告しない。
// 翻訳を入れる際は buildAlternates へ戻し、metadata も getTranslations 経由にする。
export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: buildSingleSourceAlternates('/timeline'),
    openGraph: {
      title: socialTitle(TITLE),
      description: DESCRIPTION,
      url: '/timeline',
    },
  };
}

export default function TimelinePage() {
  return (
    <>
      <LandingHeader />
      <TimelineBody
        entries={RELEASE_ENTRIES}
        sourceReportCount={RELEASE_SOURCE_REPORT_COUNT}
        period={RELEASE_PERIOD}
      />
      <Container maxWidth="lg" sx={{ pb: { xs: 4, md: 6 } }}>
        <InsightTrack
          entries={INSIGHT_ENTRIES}
          themes={INSIGHT_THEMES}
          sourceReportCount={INSIGHT_SOURCE_REPORT_COUNT}
          period={INSIGHT_PERIOD}
        />
      </Container>
    </>
  );
}
