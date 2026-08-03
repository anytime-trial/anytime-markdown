import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Link as NextLink } from '../../../../i18n/navigation';
import type { TraceFileMeta } from '../../../api/trace/list/route';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Anytime Trail 側の画面なので、ルート layout の "- Anytime Markdown" を付けない
  title: { absolute: 'Trace - Anytime Trail' },
  description: 'Execution trace viewer. Open trace files recorded by Anytime Trail.',
  robots: { index: false },
};

async function listTraceFiles(): Promise<TraceFileMeta[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/trace/list`, { cache: 'no-store' });
    if (!res.ok) { return []; }
    return (await res.json()) as TraceFileMeta[];
  } catch {
    return [];
  }
}

/**
 * API の取得を待つ部分。Why not: ルート単位の `loading.tsx` を使わない
 * （配下の `[file]` へ継承され、そこの `notFound()` がソフト 404 になる）。
 */
async function TraceList() {
  const files = await listTraceFiles();

  return (
    <main style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
        Trace Files
      </h1>

      {files.length === 0 ? (
        <p style={{ color: 'var(--text-secondary, #888)' }}>
          トレースファイルが見つかりません。VS Code で「Run with Trace」を実行して生成してください。
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {files.map(f => (
            <li key={f.name}>
              <NextLink
                href={`/report/trace/${encodeURIComponent(f.name.replace(/\.json$/, ''))}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: 8,
                  border: '1px solid var(--divider, #e0e0e0)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{f.name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)' }}>
                  {new Date(f.mtime).toLocaleString()}
                </span>
              </NextLink>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function TraceListPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}>Loading...</main>}>
      <TraceList />
    </Suspense>
  );
}
