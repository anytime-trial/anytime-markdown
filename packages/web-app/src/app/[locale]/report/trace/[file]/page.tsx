import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import TraceReportBody from './TraceReportBody';

interface Props {
  params: Promise<{ file: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { file } = await params;
  const fileName = decodeURIComponent(file) + '.json';
  return {
    title: { absolute: `Trace: ${fileName} - Anytime Trail` },
    description: `Execution trace viewer for ${fileName}`,
    robots: { index: false },
  };
}

export default async function TraceFilePage({ params }: Readonly<Props>) {
  const { file } = await params;
  if (!file || file.includes('..')) {
    notFound();
  }
  const fileName = decodeURIComponent(file) + '.json';

  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <TraceReportBody fileName={fileName} />
    </Suspense>
  );
}
