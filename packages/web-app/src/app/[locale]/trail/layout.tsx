import type { Metadata } from 'next';

// page.tsx は 'use client' のため metadata を export できない。server layout 側で与える。
export const metadata: Metadata = {
  title: 'Trail',
  description: 'Anytime Trail viewer for development sessions, commits, and code graphs.',
  alternates: { canonical: '/trail' },
  // 開発者自身の記録を閲覧するビューアで検索流入の価値がないため、インデックス対象から外す
  robots: { index: false, follow: false },
};

export default function TrailLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
