import type { Metadata } from 'next';

// page.tsx は 'use client' のため metadata を export できない。server layout 側で与える。
export const metadata: Metadata = {
  title: 'Graph',
  description: 'Graph editor for diagrams and node-link structures.',
  alternates: { canonical: '/graph' },
  // 内部ツール。インデックス対象から外す
  robots: { index: false, follow: false },
};

export default function GraphLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
