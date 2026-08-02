import type { Metadata } from 'next';

import { socialTitle } from '../../lib/siteMetadata';

const TITLE = 'Editor';
/** openGraph / twitter は title.template が効かないため、同じ文言から完全形を導出する */
const SOCIAL_TITLE = socialTitle(TITLE);
const DESCRIPTION =
  'Free WYSIWYG Markdown editor with Mermaid diagrams, PlantUML preview, KaTeX math, diff comparison, merge, and table editor. No sign-up required. | 無料WYSIWYGマークダウン エディタ。Mermaid/PlantUML図解、KaTeX数式、差分比較(diff)、マージ(merge)、表編集対応。登録不要。';
const SOCIAL_DESCRIPTION =
  'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, table editor. No sign-up required.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: '/markdown',
  },
  openGraph: {
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
  },
};

export default function MarkdownLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
