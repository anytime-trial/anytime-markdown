import type { NextRequest, NextResponse } from "next/server";
import { trailReaderRoute } from "../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const period = (req.nextUrl.searchParams.get('period') ?? 'day') as 'day' | 'week' | 'session';
  const rangeDaysRaw = Number.parseInt(req.nextUrl.searchParams.get('rangeDays') ?? '30', 10);
  const rangeDays = ([30, 90, 180].includes(rangeDaysRaw) ? rangeDaysRaw : 30) as 30 | 90 | 180;
  return trailReaderRoute((r) => r.getBehaviorData(period, rangeDays), null, '/api/trail/behavior');
}
