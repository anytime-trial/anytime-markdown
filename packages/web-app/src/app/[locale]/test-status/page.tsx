import type { Metadata } from 'next';

import { buildSingleSourceAlternates } from '../../../lib/localeAlternates';
import { socialTitle } from '../../../lib/siteMetadata';
import { TEST_MEANS, TEST_STATUS_SNAPSHOT } from '../../../lib/testStatus/data';
import LandingHeader from '../components/LandingHeader';
import TestStatusBody from './TestStatusBody';

const TITLE = 'テスト実施状況';
const DESCRIPTION =
  'テスト実施の指針に沿って、anytime-markdown の全パッケージのユニットテストを実行した結果と、テスト手段ごとの実施状況をまとめたページ。| Unit test results across all anytime-markdown packages and the status of each testing method in the test execution policy.';

// 本文が日本語のみ（i18n メッセージを使っていない）ため、en 版があるとは申告しない
export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: buildSingleSourceAlternates('/test-status'),
    openGraph: {
      title: socialTitle(TITLE),
      description: DESCRIPTION,
      url: '/test-status',
    },
  };
}

export default function TestStatusPage() {
  return (
    <>
      <LandingHeader />
      <TestStatusBody snapshot={TEST_STATUS_SNAPSHOT} means={TEST_MEANS} />
    </>
  );
}
