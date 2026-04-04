'use client';

import dynamic from 'next/dynamic';

const C4Viewer = dynamic(
  () => import('./components/C4Viewer').then(m => ({ default: m.C4Viewer })),
  { ssr: false },
);

export default function C4Page() {
  return <C4Viewer />;
}
