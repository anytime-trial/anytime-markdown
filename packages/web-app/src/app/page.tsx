import type { Metadata } from 'next';

import VsCodeBody from './vscode/VsCodeBody';

export const metadata: Metadata = {
  title: 'Anytime Markdown - Code and docs with AI, in one editor',
  description:
    'Rich Markdown editing in Visual Studio Code. WYSIWYG, AI diff highlighting, image annotation, and Git integration. | Visual Studio Code で Markdown をリッチに編集。AI 差分ハイライト、画像アノテーション、Git 連携。',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Anytime Markdown - Code and docs with AI, in one editor',
    description:
      'Rich Markdown editing in Visual Studio Code. WYSIWYG, AI diff highlighting, image annotation, and Git integration.',
    type: 'website',
    siteName: 'Anytime Markdown',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anytime Markdown - Code and docs with AI, in one editor',
    description:
      'Rich Markdown editing in Visual Studio Code. WYSIWYG, AI diff highlighting, image annotation, and Git integration.',
  },
};

export default function Page() {
  return <VsCodeBody />;
}
