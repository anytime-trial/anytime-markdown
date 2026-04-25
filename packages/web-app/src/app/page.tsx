import type { Metadata } from 'next';

import { PressBody } from './press/PressBody';

const TITLE = 'Caravan Press · Anytime Markdown';
const DESCRIPTION =
  'A newspaper-press dispatch of Anytime Markdown — slow writing, by design. Browser-only markdown editor for Spec-Driven Development.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com',
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Anytime Markdown',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Page() {
  return <PressBody />;
}
