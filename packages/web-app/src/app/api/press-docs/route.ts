import { NextResponse } from 'next/server';

import { extractErrorMessage } from '../../../lib/api-helpers';
import { fetchLayoutData } from '../../../lib/s3Client';
import type { LayoutData } from '../../../types/layout';

export type { LayoutCategory, LayoutCategoryItem,LayoutData } from '../../../types/layout';

export const revalidate = 1800;

export async function GET() {
    try {
        const data: LayoutData = await fetchLayoutData();
        return NextResponse.json(data);
    } catch (e) {
        const message = extractErrorMessage(e);
        console.error(`[/api/press-docs] ${message}`, e instanceof Error ? e.stack : e);
        // 形状は成功時と同じに保ちつつ 503 を返す。200 のままだと「カテゴリが 0 件」と
        // 「S3 から取得できなかった」がクライアントで区別できず、障害が沈黙する。
        return NextResponse.json({ categories: [] } satisfies LayoutData, { status: 503 });
    }
}
