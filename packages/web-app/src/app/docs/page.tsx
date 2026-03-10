import type { Metadata } from 'next';
import { fetchLayoutData } from '../../lib/s3Client';
import SitesBody from './SitesBody';

export const metadata: Metadata = {
  title: 'Docs - Anytime Markdown',
  description: 'Documentation and guides for Anytime Markdown. | Anytime Markdownのドキュメントとガイド。',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'Docs - Anytime Markdown',
    description: 'Documentation and guides for Anytime Markdown.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Docs - Anytime Markdown',
    description: 'Documentation and guides for Anytime Markdown.',
  },
};

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  let initialData;
  try {
    initialData = await fetchLayoutData();
  } catch {
    initialData = { categories: [], error: true };
  }

  return <SitesBody initialData={initialData} />;
}
