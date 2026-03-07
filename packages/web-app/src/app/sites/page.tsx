import type { Metadata } from 'next';
import SitesBody from './SitesBody';

export const metadata: Metadata = {
  title: 'Sites - Anytime Markdown',
  description: 'Document site powered by Anytime Markdown',
  alternates: { canonical: '/sites' },
};

export default function SitesPage() {
  return <SitesBody />;
}
