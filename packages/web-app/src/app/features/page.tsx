import type { Metadata } from 'next';
import FeaturesBody from './FeaturesBody';

export const metadata: Metadata = {
  title: 'Features - Anytime Markdown',
  description: 'Explore all the features of Anytime Markdown — Mermaid/PlantUML diagrams, KaTeX math, diff comparison, merge, tables, and more. | Anytime Markdownの全機能。Mermaid/PlantUML図、KaTeX数式、差分比較、マージ、テーブル等。',
  alternates: {
    canonical: '/features',
  },
  openGraph: {
    title: 'Features - Anytime Markdown',
    description: 'Mermaid/PlantUML diagrams, KaTeX math, diff comparison, merge, tables, and more.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features - Anytime Markdown',
    description: 'Mermaid/PlantUML diagrams, KaTeX math, diff comparison, merge, tables, and more.',
  },
};

export default function FeaturesPage() {
  return <FeaturesBody />;
}
