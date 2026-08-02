import type { Metadata } from 'next';

// page.tsx は 'use client' のため metadata を export できない。server layout 側で与える。
export const metadata: Metadata = {
  title: 'Database',
  description: 'SQLite database viewer and editor running in the browser.',
  alternates: { canonical: '/database' },
  // 内部ツール。インデックス対象から外す
  robots: { index: false, follow: false },
};

export default function DatabaseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
