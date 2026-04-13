import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ExportExtractor, createSourceFile } from '@anytime-markdown/trail-core/analyzer';

import { NO_STORE_HEADERS, createC4ModelStore } from '../../../../lib/api-helpers';

/**
 * GET /api/c4/exports?componentId=...&repo=...
 *
 * C4 コンポーネント配下のコード要素から export シンボル一覧を返す。
 * 返却形状: { symbols: ExportedSymbol[] } | 204 No Content
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const componentId = searchParams.get('componentId');
  const repo = searchParams.get('repo') ?? '';

  if (!componentId) {
    return NextResponse.json({ error: 'componentId is required' }, { status: 400 });
  }

  const store = createC4ModelStore();
  if (!store) return new NextResponse(null, { status: 204 });

  try {
    const [modelResult, graphResult] = await Promise.all([
      store.getCurrentC4Model(repo),
      store.getCurrentGraph(repo),
    ]);
    if (!modelResult || !graphResult) return new NextResponse(null, { status: 204 });

    const { model } = modelResult;
    const { graph } = graphResult;
    const { projectRoot } = graph.metadata;

    // C4 component 配下の code 要素 ID を収集
    const codeElementIds = new Set(
      model.elements
        .filter(el => el.type === 'code' && el.boundaryId === componentId)
        .map(el => el.id),
    );

    if (codeElementIds.size === 0) {
      return NextResponse.json({ symbols: [] }, { headers: NO_STORE_HEADERS });
    }

    // TrailGraph からファイルパスを取得し、ソースファイルを読み込む
    const sourceFiles = [];
    for (const node of graph.nodes) {
      if (!codeElementIds.has(node.id)) continue;
      const absolutePath = join(projectRoot, node.filePath);
      try {
        const content = readFileSync(absolutePath, 'utf-8');
        sourceFiles.push(createSourceFile(node.filePath, content));
      } catch (readErr) {
        console.error(`[/api/c4/exports] failed to read file: ${absolutePath}`, readErr);
      }
    }

    const symbols = ExportExtractor.extract(sourceFiles, componentId);
    return NextResponse.json({ symbols }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/exports] error', e);
    return NextResponse.json({ symbols: [] }, { headers: NO_STORE_HEADERS });
  }
}
