import type { Metadata } from 'next';

import { PressBody } from './PressBody';

export const metadata: Metadata = {
  title: 'Caravan Press · Anytime Markdown',
  description:
    'A newspaper-press dispatch of Anytime Markdown — slow writing, by design. Browser-only markdown editor for Spec-Driven Development.',
  alternates: { canonical: '/press' },
};

export default function PressPage() {
  return <PressBody />;
}
