import { NextResponse } from 'next/server';

import { listReports } from '../../../lib/reportClient';
import type { ReportMeta } from '../../../types/report';

export interface PressReportsResponse {
    daily: ReportMeta | null;
    weekly: ReportMeta | null;
}

export const revalidate = 3600;

export async function GET() {
    try {
        const reports = await listReports();
        const daily = reports.find((r) => r.category?.toLowerCase() === 'daily') ?? null;
        const weekly = reports.find((r) => r.category?.toLowerCase() === 'weekly') ?? null;
        return NextResponse.json({ daily, weekly } satisfies PressReportsResponse);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error(`[/api/press-reports] ${message}`, e instanceof Error ? e.stack : e);
        return NextResponse.json({ daily: null, weekly: null } satisfies PressReportsResponse);
    }
}
