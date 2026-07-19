import type { NextResponse } from "next/server";

import { trailReaderRoute } from "../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return trailReaderRoute((r) => r.getCostOptimization(), null, '/api/trail/cost-optimization', '/api/trail/cost-optimization');
}
