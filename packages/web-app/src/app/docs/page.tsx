import type { Metadata } from 'next';
import SitesBody from './SitesBody';

export const metadata: Metadata = {
  title: 'Docs - Anytime Markdown',
  description: 'Document site powered by Anytime Markdown',
  alternates: { canonical: '/docs' },
};

export default function SitesPage() {
  return <SitesBody />;
}
