import type { NextResponse } from "next/server";

import { trailReaderRoute } from "../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  return trailReaderRoute((r) => r.getAnalytics(), null, '/api/trail/analytics');
}
