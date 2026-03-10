import type { Metadata } from 'next';
import LandingPage from './components/LandingPage';

export const metadata: Metadata = {
  title: 'Anytime Markdown - Write Markdown, Beautifully',
  description:
    'Free browser-based WYSIWYG Markdown editor with Mermaid/PlantUML diagrams, KaTeX math, diff comparison, merge, tables, and code blocks. No sign-up required. | 無料のブラウザ対応WYSIWYGマークダウンエディタ。設計書作成にも最適。登録不要。',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Anytime Markdown - Write Markdown, Beautifully',
    description:
      'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, tables. No sign-up required.',
    type: 'website',
    siteName: 'Anytime Markdown',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anytime Markdown - Write Markdown, Beautifully',
    description:
      'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, tables. No sign-up required.',
  },
};

export default function Page() {
  return <LandingPage />;
}
