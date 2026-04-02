'use client';

import dynamic from 'next/dynamic';

const ViewerBody = dynamic(
  () => import('./components/ViewerBody').then((m) => ({ default: m.ViewerBody })),
  { ssr: false },
);

export default function ViewerPage() {
  return <ViewerBody />;
}
