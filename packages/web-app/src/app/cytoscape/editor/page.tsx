'use client';

import dynamic from 'next/dynamic';

const EditorBody = dynamic(
  () => import('./components/EditorBody').then(m => ({ default: m.EditorBody })),
  { ssr: false },
);

export default function EditorPage() {
  return <EditorBody />;
}
