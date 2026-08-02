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
        // 形状は成功時と同じに保ちつつ 503 を返す。200 のままだと「レポートが 0 件」と
        // 「S3 から取得できなかった」がクライアントで区別できず、障害が沈黙する。
        return NextResponse.json({ daily: null, weekly: null } satisfies PressReportsResponse, {
            status: 503,
        });
    }
}
