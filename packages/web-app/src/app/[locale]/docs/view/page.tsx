import FullPageLoader from '@anytime-markdown/markdown-react-islands/src/components/loader/FullPageLoader';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { buildSingleSourceAlternates } from '../../../../lib/localeAlternates';
import { fetchLayoutData } from '../../../../lib/s3Client';
import DocsViewBody from './DocsViewBody';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ key?: string; ghPath?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { key } = await searchParams;
  if (!key) {
    return {
      title: 'Document',
    };
  }

  try {
    const layout = await fetchLayoutData();
    const item = layout.categories.flatMap((c) => c.items).find((i) => i.docKey === key);
    const category = layout.categories.find((c) => c.items.some((i) => i.docKey === key));
    const title = item?.displayName ?? key.replace(/\.md$/, '').split('/').pop() ?? 'Document';

    return {
      title,
      description: category?.description || undefined,
      // ドキュメント本文は S3 上の単一ソースで /en でも同じ内容を返すため hreflang は出さない
      alternates: buildSingleSourceAlternates(`/docs/view?key=${encodeURIComponent(key)}`),
    };
  } catch {
    return {
      title: 'Document',
    };
  }
}

/**
 * S3 のレイアウト取得を待つ部分。Why not: ルート単位の `loading.tsx` を使わない
 * （配下へ継承され `notFound()` がソフト 404 になる）。境界はページの内側に閉じる。
 */
async function DocsView({ docKey }: Readonly<{ docKey?: string }>) {
  let docTitle: string | undefined;
  if (docKey) {
    try {
      const layout = await fetchLayoutData();
      const item = layout.categories.flatMap((c) => c.items).find((i) => i.docKey === docKey);
      docTitle = item?.displayName;
    } catch { /* fallback to key-derived name in client */ }
  }
  return <DocsViewBody docTitle={docTitle} />;
}

export default async function DocsViewPage({ searchParams }: Readonly<Props>) {
  const { key } = await searchParams;
  return (
    <Suspense fallback={<FullPageLoader />}>
      <DocsView docKey={key} />
    </Suspense>
  );
}
