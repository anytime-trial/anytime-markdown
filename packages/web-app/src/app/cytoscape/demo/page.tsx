import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Demo & Showcase - Cytoscape.js',
  description: 'Explore Cytoscape.js layout algorithms and graph analysis',
  alternates: { canonical: '/cytoscape/demo' },
};

const DemoBody = dynamic(
  () => import('./components/DemoBody').then(m => ({ default: m.DemoBody })),
  { ssr: false },
);

export default function DemoPage() {
  return <DemoBody />;
}
