"use client";

import dynamic from 'next/dynamic';

import FullPageLoader from '@/components/loader/FullPageLoader';

const MarkdownEditorPage = dynamic(
  () => import('./MarkdownEditorPage'),
  {
    ssr: false,
    loading: () => <FullPageLoader />,
  }
);

export default function MarkdownEditorRoute() {
  return <MarkdownEditorPage />;
}
