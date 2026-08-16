import type { Metadata } from 'next';

import { buildSingleSourceAlternates } from '../../../lib/localeAlternates';
import {
  RELEASE_ENTRIES,
  RELEASE_PERIOD,
  RELEASE_SOURCE_REPORT_COUNT,
} from '../../../lib/releaseTimeline/data';
import { socialTitle } from '../../../lib/siteMetadata';
import LandingHeader from '../components/LandingHeader';
import TimelineBody from './TimelineBody';

const TITLE = 'Claude Code リリース年表';
const DESCRIPTION =
  '日次技術調査レポートが観測した Claude Code 本体と Claude モデルのリリースを時系列でまとめた年表。| A timeline of Claude Code and Claude model releases observed in daily technical research reports.';

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
    </>
  );
}
