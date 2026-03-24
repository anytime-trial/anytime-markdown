'use client';

import dynamic from 'next/dynamic';

const GraphEditor = dynamic(
  () => import('./components/GraphEditor').then(m => ({ default: m.GraphEditor })),
  { ssr: false },
);

export default function GraphPage() {
  return <GraphEditor />;
}
