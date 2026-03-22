import type { Metadata } from 'next';

import VsCodeBody from './vscode/VsCodeBody';

export const metadata: Metadata = {
  title: 'Anytime Markdown - SDD × AI Markdown Editor',
  description:
    'Spec-Driven Development (SDD) Markdown editor for AI collaboration. AI diff highlighting, image annotation, image prompt. Visual Studio Code extension available. | 仕様駆動開発(SDD)対応 AI コラボレーション マークダウンエディタ。AI差分ハイライト、画像アノテーション、イメージプロンプト対応。Visual Studio Code拡張。',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Anytime Markdown - SDD × AI Markdown Editor',
    description:
      'Spec-Driven Development (SDD) Markdown editor with AI diff highlighting, image annotation, and image prompt. Visual Studio Code extension.',
    type: 'website',
    siteName: 'Anytime Markdown',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anytime Markdown - SDD × AI Markdown Editor',
    description:
      'Spec-Driven Development (SDD) Markdown editor with AI diff highlighting, image annotation, and image prompt. Visual Studio Code extension.',
  },
};

export default function Page() {
  return <VsCodeBody />;
}
