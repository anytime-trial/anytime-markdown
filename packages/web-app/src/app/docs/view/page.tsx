import type { Metadata } from 'next';
import { fetchLayoutData } from '../../../lib/s3Client';
import DocsViewBody from './DocsViewBody';

interface Props {
  searchParams: Promise<{ key?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { key } = await searchParams;
  if (!key) {
    return {
      title: 'Document - Anytime Markdown',
    };
  }

  try {
    const layout = await fetchLayoutData();
    const item = layout.categories.flatMap((c) => c.items).find((i) => i.docKey === key);
    const category = layout.categories.find((c) => c.items.some((i) => i.docKey === key));
    const title = item?.displayName ?? key.replace(/\.md$/, '').split('/').pop() ?? 'Document';

    return {
      title: `${title} - Anytime Markdown`,
      description: category?.description || undefined,
      alternates: { canonical: `/docs/view?key=${encodeURIComponent(key)}` },
    };
  } catch {
    return {
      title: 'Document - Anytime Markdown',
    };
  }
}

export default function DocsViewPage() {
  return <DocsViewBody />;
}
