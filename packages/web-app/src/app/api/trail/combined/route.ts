import type { NextRequest, NextResponse } from "next/server";
import { trailReaderRoute } from "../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const period = (req.nextUrl.searchParams.get('period') ?? 'day') as 'day' | 'week';
  const rangeDaysRaw = Number.parseInt(req.nextUrl.searchParams.get('rangeDays') ?? '30', 10);
  const rangeDays = ([30, 90].includes(rangeDaysRaw) ? rangeDaysRaw : 30) as 30 | 90;
  return trailReaderRoute((r) => r.getCombinedData(period, rangeDays), null, '/api/trail/combined');
}
