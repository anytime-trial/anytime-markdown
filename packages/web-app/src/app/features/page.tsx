import type { Metadata } from 'next';
import FeaturesBody from './FeaturesBody';

export const metadata: Metadata = {
  title: 'Features - Anytime Markdown',
  description: 'Explore all the features of Anytime Markdown — a free, open-source WYSIWYG markdown editor.',
};

export default function FeaturesPage() {
  return <FeaturesBody />;
}
