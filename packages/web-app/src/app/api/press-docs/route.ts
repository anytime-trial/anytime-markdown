import { NextResponse } from 'next/server';

import { fetchLayoutData } from '../../../lib/s3Client';
import type { LayoutData } from '../../../types/layout';

export type { LayoutCategory, LayoutCategoryItem,LayoutData } from '../../../types/layout';

export const revalidate = 1800;

export async function GET() {
    try {
        const data: LayoutData = await fetchLayoutData();
        return NextResponse.json(data);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error(`[/api/press-docs] ${message}`, e instanceof Error ? e.stack : e);
        return NextResponse.json({ categories: [] } satisfies LayoutData);
    }
}
