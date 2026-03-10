import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Editor - Anytime Markdown',
  description:
    'Free WYSIWYG Markdown editor with Mermaid/PlantUML diagrams, KaTeX math, diff comparison, merge, and tables. No sign-up required. | 無料WYSIWYGマークダウンエディタ。Mermaid/PlantUML図、KaTeX数式、差分比較、マージ対応。登録不要。',
  alternates: {
    canonical: '/markdown',
  },
  openGraph: {
    title: 'Editor - Anytime Markdown',
    description:
      'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, tables. No sign-up required.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Editor - Anytime Markdown',
    description:
      'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, tables. No sign-up required.',
  },
};

export default function MarkdownLayout({ children }: { children: React.ReactNode }) {
  return children;
}
