'use client';

import dynamic from 'next/dynamic';

const DemoBody = dynamic(
  () => import('./components/DemoBody').then(m => ({ default: m.DemoBody })),
  { ssr: false },
);

export default function DemoPage() {
  return <DemoBody />;
}
