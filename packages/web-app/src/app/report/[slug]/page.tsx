import type { Metadata } from 'next';

import { getReportBySlug, listReports } from '../../../lib/reportClient';
import { buildNavigation } from '../../../lib/reportUtils';
import type { ReportMeta } from '../../../types/report';
import ReportDetailBody from './ReportDetailBody';

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const report = await getReportBySlug(slug);

  if (!report) {
    return { title: 'Report Not Found - Anytime Markdown' };
  }

  return {
    title: `${report.meta.title} - Anytime Markdown`,
    description: report.meta.excerpt,
    alternates: { canonical: `/report/${slug}` },
    openGraph: {
      title: report.meta.title,
      description: report.meta.excerpt,
      type: 'article',
      publishedTime: report.meta.date,
      authors: report.meta.author ? [report.meta.author] : undefined,
    },
  };
}

export default async function ReportDetailPage({ params }: Props) {
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
  } catch { /* fallback: null */ }

  return <ReportDetailBody report={report} prev={nav.prev} next={nav.next} />;
}
