import type { Metadata } from 'next';

// page.tsx は 'use client' のため metadata を export できない。server layout 側で与える。
export const metadata: Metadata = {
  title: 'Sheet',
  description: 'Spreadsheet editor with charts running in the browser.',
  alternates: { canonical: '/sheet' },
  // 内部ツール。インデックス対象から外す
  robots: { index: false, follow: false },
};

export default function SheetLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
