import type { Metadata } from 'next';
import EditBody from './EditBody';

export const metadata: Metadata = {
  title: 'Edit Layout - Anytime Markdown',
  description: 'Edit card layout for document site',
  alternates: { canonical: '/docs/edit' },
};

export default function SitesEditPage() {
  return <EditBody />;
}
