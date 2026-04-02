import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Data Viewer - Cytoscape.js',
  description: 'Visualize graph data from JSON, file upload, or sample datasets',
  alternates: { canonical: '/cytoscape/viewer' },
};

const ViewerBody = dynamic(
  () => import('./components/ViewerBody').then((m) => ({ default: m.ViewerBody })),
  { ssr: false },
);

export default function ViewerPage() {
  return <ViewerBody />;
}
