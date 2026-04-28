import { NextResponse } from 'next/server';

import { extractErrorMessage } from '../../../lib/api-helpers';
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
        const daily = reports.find((r) => r.category?.toLowerCase().includes('daily')) ?? null;
        const weekly = reports.find((r) => r.category?.toLowerCase().includes('weekly')) ?? null;
        return NextResponse.json({ daily, weekly } satisfies PressReportsResponse);
    } catch (e) {
        const message = extractErrorMessage(e);
        console.error(`[/api/press-reports] ${message}`, e instanceof Error ? e.stack : e);
        return NextResponse.json({ daily: null, weekly: null } satisfies PressReportsResponse);
    }
}
