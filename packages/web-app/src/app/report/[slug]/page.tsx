import type { Metadata } from 'next';

import { getReportBySlug, listReports } from '../../../lib/reportClient';
import { buildNavigation } from '../../../lib/reportUtils';
import { SITE_NAME } from '../../../lib/siteMetadata';
import type { ReportMeta } from '../../../types/report';
import ReportDetailBody from './ReportDetailBody';

export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const report = await getReportBySlug(slug);

  if (!report) {
    return { title: 'Report Not Found', robots: { index: false, follow: true } };
  }

  return {
    title: report.meta.title,
    description: report.meta.excerpt,
    alternates: { canonical: `/report/${slug}` },
    openGraph: {
      title: report.meta.title,
      description: report.meta.excerpt,
      type: 'article',
      url: `/report/${slug}`,
      publishedTime: report.meta.date,
      authors: report.meta.author ? [report.meta.author] : undefined,
    },
  };
}

/**
 * サムネイルは相対パスの場合 S3 / CloudFront の解決が要るため、絶対 URL のときだけ採用し、
 * それ以外はサイト共通の OG 画像へ縮退する（誤った画像 URL を構造化データへ載せない）。
 */
function resolveArticleImage(thumbnail: string | undefined): string {
  if (thumbnail && /^https?:\/\//.test(thumbnail)) return thumbnail;
  return `${BASE_URL}/opengraph-image`;
}

function buildArticleJsonLd(meta: ReportMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.excerpt,
    datePublished: meta.date,
    dateModified: meta.date,
    image: resolveArticleImage(meta.thumbnail),
    articleSection: meta.category,
    author: {
      '@type': meta.author ? 'Person' : 'Organization',
      name: meta.author ?? SITE_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${BASE_URL}/report/${meta.slug}`,
    },
  };
}

function buildBreadcrumbJsonLd(meta: ReportMeta) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Report', item: `${BASE_URL}/report` },
      { '@type': 'ListItem', position: 3, name: meta.title, item: `${BASE_URL}/report/${meta.slug}` },
    ],
  };
}

export default async function ReportDetailPage({ params }: Readonly<Props>) {
  const { slug } = await params;

  let report: { meta: ReportMeta; content: string } | null = null;
  let nav = { prev: null as ReportMeta | null, next: null as ReportMeta | null };

  try {
    const [reportResult, allReports] = await Promise.all([
      getReportBySlug(slug),
      listReports(),
    ]);
    report = reportResult;
    if (report) {
      nav = buildNavigation(allReports, slug);
    }
  } catch (e: unknown) {
    console.warn(
      `[${new Date().toISOString()}] [WARN] [/report/${slug}] failed to load report:`,
      e instanceof Error ? e.stack : e,
    );
  }

  return (
    <>
      {report && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(buildArticleJsonLd(report.meta)) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd(report.meta)) }}
          />
        </>
      )}
      <ReportDetailBody report={report} prev={nav.prev} next={nav.next} />
    </>
  );
}
