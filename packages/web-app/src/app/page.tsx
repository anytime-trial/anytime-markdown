import type { Metadata } from 'next';
import LandingPage from './components/LandingPage';

export const metadata: Metadata = {
  title: 'Anytime Markdown - Write Markdown, Beautifully',
  description:
    'A free, open-source WYSIWYG markdown editor that works entirely in your browser. No sign-up, no server.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Anytime Markdown',
    description:
      'A free, open-source WYSIWYG markdown editor that works entirely in your browser.',
    type: 'website',
    siteName: 'Anytime Markdown',
  },
};

export default function Page() {
  return <LandingPage />;
}
