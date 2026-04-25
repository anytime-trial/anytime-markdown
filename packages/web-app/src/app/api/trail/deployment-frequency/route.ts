import { type NextRequest, NextResponse } from 'next/server';

import { trailReaderRoute } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const bucket = (searchParams.get('bucket') === 'week' ? 'week' : 'day') as 'day' | 'week';
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }
  return trailReaderRoute(
    (r) => r.getDeploymentFrequency({ from, to }, bucket),
    [] as ReadonlyArray<{ bucketStart: string; value: number }>,
    '/api/trail/deployment-frequency',
  );
}
