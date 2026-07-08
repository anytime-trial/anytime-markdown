import { type NextRequest, NextResponse } from "next/server";

import { getGoogleToken } from "../../../../lib/githubAuth";
import {
  buildDriveMediaRequest,
  buildDriveMetaRequest,
  buildDriveUpdateRequest,
  type DriveFileMeta,
  type DriveRequest,
} from "@anytime-markdown/markdown-viewer/fs/drive-client";

/** Drive API へのリクエストを実行する。fetch 実行そのものはここでのみ行う。 */
function driveFetch(token: string, req: DriveRequest): Promise<Response> {
  return fetch(req.url, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(req.contentType ? { "Content-Type": req.contentType } : {}),
    },
    body: req.body,
  });
}

/** Drive API のエラーレスポンスをそのまま NextResponse へ透過する。 */
async function driveErrorResponse(res: Response): Promise<NextResponse> {
  const body = await res.text();
  return NextResponse.json({ error: body }, { status: res.status });
}

/** GET /api/drive/content?fileId=... : メタ情報＋本文を取得する。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getGoogleToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "fileId required" }, { status: 400 });
  }

  const metaRes = await driveFetch(token, buildDriveMetaRequest(fileId));
  if (!metaRes.ok) {
    return driveErrorResponse(metaRes);
  }
  const meta = (await metaRes.json()) as DriveFileMeta;

  const mediaRes = await driveFetch(token, buildDriveMediaRequest(fileId));
  if (!mediaRes.ok) {
    return driveErrorResponse(mediaRes);
  }
  const content = await mediaRes.text();

  return NextResponse.json({
    name: meta.name,
    headRevisionId: meta.headRevisionId,
    content,
  });
}

interface DrivePutBody {
  fileId?: string;
  content?: string;
  headRevisionId?: string;
}

function parseDrivePutBody(value: unknown): DrivePutBody {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  return {
    fileId: typeof record.fileId === "string" ? record.fileId : undefined,
    content: typeof record.content === "string" ? record.content : undefined,
    headRevisionId:
      typeof record.headRevisionId === "string" ? record.headRevisionId : undefined,
  };
}

/** PUT /api/drive/content : 本文を更新する。headRevisionId 不一致は 409 で通知する。 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const token = await getGoogleToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { fileId, content, headRevisionId } = parseDrivePutBody(await request.json());
  if (!fileId || content === undefined) {
    return NextResponse.json(
      { error: "fileId and content required" },
      { status: 400 },
    );
  }

  if (headRevisionId) {
    const metaRes = await driveFetch(token, buildDriveMetaRequest(fileId));
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as DriveFileMeta;
      if (meta.headRevisionId !== headRevisionId) {
        return NextResponse.json(
          { conflict: true, headRevisionId: meta.headRevisionId },
          { status: 409 },
        );
      }
    }
  }

  const updateRes = await driveFetch(token, buildDriveUpdateRequest(fileId, content));
  if (!updateRes.ok) {
    return driveErrorResponse(updateRes);
  }

  const metaRes = await driveFetch(token, buildDriveMetaRequest(fileId));
  const meta = metaRes.ok ? ((await metaRes.json()) as DriveFileMeta) : null;
  return NextResponse.json({ ok: true, headRevisionId: meta?.headRevisionId ?? null });
}
