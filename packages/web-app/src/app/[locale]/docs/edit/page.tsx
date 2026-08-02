import type { Metadata } from 'next';

import EditBody from './EditBody';

export const metadata: Metadata = {
  title: 'Edit Layout',
  description: 'Edit card layout for document site',
  alternates: { canonical: '/docs/edit' },
  // 編集画面。公開検索の対象にしない
  robots: { index: false, follow: false },
};

export default function SitesEditPage() {
  return <EditBody />;
}
