import type { Metadata } from 'next';

// page.tsx は 'use client' のため metadata を export できない。server layout 側で与える。
export const metadata: Metadata = {
  title: 'Genealogy Diagram',
  description: 'Genealogy diagram viewer and layout editor for *.diagram.json files.',
  alternates: { canonical: '/diagram' },
  // 内部ツール。インデックス対象から外す
  robots: { index: false, follow: false },
};

export default function DiagramLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
