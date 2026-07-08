/**
 * Google Drive API v3 リクエスト組み立て・fileId 抽出の純粋関数群。
 *
 * fetch 実行そのものは呼び出し側（web-app のサーバープロキシ・拡張の直 fetch）が担う。
 * ここでは URL / method / body の組み立てのみを行い、環境非依存に保つ。
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export interface DriveRequest {
  url: string;
  method: "GET" | "PATCH";
  contentType?: string;
  body?: string;
}

export interface DriveFileMeta {
  name: string;
  headRevisionId: string;
}

export function buildDriveMetaRequest(fileId: string): DriveRequest {
  const fields = encodeURIComponent("name,headRevisionId");
  return {
    url: `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=${fields}`,
    method: "GET",
  };
}

export function buildDriveMediaRequest(fileId: string): DriveRequest {
  return {
    url: `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`,
    method: "GET",
  };
}

export function buildDriveUpdateRequest(fileId: string, content: string): DriveRequest {
  return {
    url: `${DRIVE_UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media`,
    method: "PATCH",
    contentType: "text/markdown",
    body: content,
  };
}

const FILE_D_RE = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/;
const OPEN_ID_RE = /^https:\/\/drive\.google\.com\/open\?id=([\w-]+)/;

export function extractDriveFileId(url: string): string | null {
  const m = FILE_D_RE.exec(url) ?? OPEN_ID_RE.exec(url);
  return m ? m[1] : null;
}
