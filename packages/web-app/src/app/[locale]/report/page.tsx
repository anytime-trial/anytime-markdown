import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';

import { buildAlternates, localeHref, toLocale } from '../../../lib/localeAlternates';
import { listReports } from '../../../lib/reportClient';
import { REPORTS_PER_PAGE } from '../../../lib/reportUtils';
import { socialTitle } from '../../../lib/siteMetadata';
import type { ReportMeta } from '../../../types/report';
import ReportListBody from './ReportListBody';

export const revalidate = 3600;

const TITLE = 'Report';
const SOCIAL_TITLE = socialTitle(TITLE);

/** generateMetadata と本体レンダリングで同一リクエスト内の S3 取得を共有する */
const loadReports = cache(async (): Promise<ReportMeta[]> => {
  try {
    return await listReports();
  } catch (e: unknown) {
    console.warn(
      `[${new Date().toISOString()}] [WARN] [/report] failed to list reports:`,
      e instanceof Error ? e.stack : e,
    );
    return [];
  }
});

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; month?: string }>;
}

function parsePage(page: string | undefined): number {
  return Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const { page, month } = await searchParams;
  const currentPage = parsePage(page);
  const isMonthFilter = !!month && /^\d{4}-\d{2}$/.test(month);
  // description はロケールごとに出し分ける（/en が日本語混じりの説明を返さないため）
  const t = await getTranslations({ locale, namespace: 'Report' });
  const description = t('metaDescription');

  // 月別アーカイブは同じ記事集合の絞り込みビュー。個別記事は sitemap から直接辿れるため、
  // 重複コンテンツを増やさないよう noindex にしつつリンクは辿らせる。
  // Why not: この分岐にだけ alternates を付けない。noindex のビューへ canonical と
  // hreflang を宣言すると「インデックスするな」と「これが正規形だ」を同時に申告することになる。
  if (isMonthFilter) {
    return {
      title: TITLE,
      description,
      robots: { index: false, follow: true },
    };
  }

  const reports = await loadReports();
  const totalPages = Math.max(1, Math.ceil(reports.length / REPORTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pathFor = (p: number) => (p <= 1 ? '/report' : `/report?page=${p}`);

  return {
    title: TITLE,
    description,
    // 2 ページ目以降を '/report' へ集約すると、そこにしか無い記事への経路が切れる。
    // ページ番号を含む自己 canonical にして各ページを独立させる。
    // Why not: rel=prev/next は 2019 年に Google がインデックス用途での利用を終了しており、
    // Next.js の metadata では <link rel> ではなく <meta name> になるため付けない。
    // ページ送りの導線は ReportListBody のリンクが担う。
    alternates: buildAlternates(pathFor(safePage), locale),
    openGraph: {
      title: SOCIAL_TITLE,
      description,
      url: localeHref(pathFor(safePage), locale),
    },
  };
}

export default async function ReportPage({ searchParams }: Readonly<Props>) {
  const { page, month } = await searchParams;
  const currentPage = parsePage(page);
  const reports = await loadReports();

  return <ReportListBody reports={reports} currentPage={currentPage} filterMonth={month} />;
}
