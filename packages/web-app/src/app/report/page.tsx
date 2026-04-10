import type { Metadata } from 'next';

import { listReports } from '../../lib/reportClient';
import type { ReportMeta } from '../../types/report';
import ReportListBody from './ReportListBody';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Report - Anytime Markdown',
  description: 'Technical reports and articles. | 技術レポートと記事。',
  alternates: { canonical: '/report' },
  openGraph: {
    title: 'Report - Anytime Markdown',
    description: 'Technical reports and articles.',
  },
};

interface Props {
  searchParams: Promise<{ page?: string; month?: string }>;
}

export default async function ReportPage({ searchParams }: Props) {
  const { page, month } = await searchParams;
  const currentPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);

  let reports: ReportMeta[] = [];
  try {
    reports = await listReports();
  } catch { /* fallback: empty */ }

  return <ReportListBody reports={reports} currentPage={currentPage} filterMonth={month} />;
}
