import type { Metadata } from 'next';
import { fetchLayoutData } from '../../lib/s3Client';
import SitesBody from './SitesBody';

export const metadata: Metadata = {
  title: 'Docs - Anytime Markdown',
  description: 'Document site powered by Anytime Markdown',
  alternates: { canonical: '/docs' },
};

export const revalidate = 60;

export default async function SitesPage() {
  let initialData;
  try {
    initialData = await fetchLayoutData();
  } catch {
    initialData = { categories: [], error: true };
  }

  return <SitesBody initialData={initialData} />;
}
