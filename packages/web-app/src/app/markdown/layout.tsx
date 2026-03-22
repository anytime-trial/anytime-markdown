import type { Metadata } from 'next';

import { EditorPageBody } from './EditorPageBody';

export const metadata: Metadata = {
  title: 'Editor - Anytime Markdown',
  description:
    'Free WYSIWYG Markdown editor with Mermaid diagrams, PlantUML preview, KaTeX math, diff comparison, merge, and table editor. No sign-up required. | 無料WYSIWYGマークダウン エディタ。Mermaid/PlantUML図解、KaTeX数式、差分比較(diff)、マージ(merge)、表編集対応。登録不要。',
  alternates: {
    canonical: '/markdown',
  },
  openGraph: {
    title: 'Editor - Anytime Markdown',
    description:
      'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, table editor. No sign-up required.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Editor - Anytime Markdown',
    description:
      'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, table editor. No sign-up required.',
  },
};

export default function MarkdownLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <EditorPageBody />
      {children}
    </>
  );
}
