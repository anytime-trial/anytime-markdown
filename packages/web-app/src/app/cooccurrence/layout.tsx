import type { Metadata } from 'next';

// page.tsx は 'use client' のため metadata を export できない。server layout 側で与える。
export const metadata: Metadata = {
  title: 'Cooccurrence',
  description: 'Co-occurrence network viewer for term relationships.',
  alternates: { canonical: '/cooccurrence' },
  // 内部ツール。インデックス対象から外す
  robots: { index: false, follow: false },
};

export default function CooccurrenceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
