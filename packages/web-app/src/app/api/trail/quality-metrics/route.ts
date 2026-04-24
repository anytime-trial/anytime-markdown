import type { QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import { type NextRequest,NextResponse } from 'next/server';

import { trailReaderRoute } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function emptyMetrics(from: string, to: string): QualityMetrics {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const duration = toMs - fromMs;
  const prevTo = new Date(fromMs - 1).toISOString();
  const prevFrom = new Date(fromMs - 1 - duration).toISOString();
  const emptyMetric = (id: 'deploymentFrequency' | 'leadTimeForChanges' | 'promptToCommitSuccessRate' | 'changeFailureRate', unit: 'perDay' | 'hours' | 'percent') => ({
    id, value: 0, unit, sampleSize: 0, timeSeries: [],
  });
  return {
    range: { from, to },
    previousRange: { from: prevFrom, to: prevTo },
    bucket: 'day',
    metrics: {
      deploymentFrequency: emptyMetric('deploymentFrequency', 'perDay'),
      leadTimeForChanges: emptyMetric('leadTimeForChanges', 'hours'),
      promptToCommitSuccessRate: emptyMetric('promptToCommitSuccessRate', 'percent'),
      changeFailureRate: emptyMetric('changeFailureRate', 'percent'),
    },
    unmeasured: [],
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 });
  }
  return trailReaderRoute(
    (r) => r.getQualityMetrics({ from, to }),
    emptyMetrics(from, to),
    '/api/trail/quality-metrics',
  );
}
