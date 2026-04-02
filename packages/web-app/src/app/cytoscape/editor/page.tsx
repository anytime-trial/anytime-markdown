import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: 'Graph Editor - Cytoscape.js',
  description: 'Build and edit graphs interactively with Cytoscape.js',
  alternates: { canonical: '/cytoscape/editor' },
};

const EditorBody = dynamic(
  () => import('./components/EditorBody').then(m => ({ default: m.EditorBody })),
  { ssr: false },
);

export default function EditorPage() {
  return <EditorBody />;
}
