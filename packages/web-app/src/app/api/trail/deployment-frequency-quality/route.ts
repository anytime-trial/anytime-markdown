import type { ReleaseQualityBucket } from '@anytime-markdown/trail-core/domain/metrics';
import { type NextRequest, NextResponse } from 'next/server';

import { trailReaderRoute } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const bucket = searchParams.get('bucket') === 'week' ? 'week' : 'day';
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }
  return trailReaderRoute(
    (r) => r.getDeploymentFrequencyQuality({ from, to }, bucket),
    [] as ReadonlyArray<ReleaseQualityBucket>,
    '/api/trail/deployment-frequency-quality',
    `/api/trail/deployment-frequency-quality?from=${from}&to=${to}&bucket=${bucket}`,
  );
}
