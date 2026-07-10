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
  method: "GET" | "PATCH" | "POST";
  contentType?: string;
  body?: string;
}

/** multipart 境界。本文に現れない固定値（Drive のサンプルと同種の英数字列）。 */
const CREATE_BOUNDARY = "anytimeMarkdownDriveBoundary";

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

/**
 * Drive 上に新規ファイルを作成する multipart リクエストを組み立てる。
 *
 * `drive.file` スコープでは、アプリが作成したファイルは以後 Picker を経由せずアクセスできる。
 * `parentId` 省略時はマイドライブ直下に作成される。
 */
export function buildDriveCreateRequest(
  name: string,
  content: string,
  parentId?: string,
): DriveRequest {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: "text/markdown",
  };
  if (parentId) metadata.parents = [parentId];

  const fields = encodeURIComponent("id,name,headRevisionId");
  const body =
    `--${CREATE_BOUNDARY}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${CREATE_BOUNDARY}\r\n` +
    "Content-Type: text/markdown\r\n\r\n" +
    `${content}\r\n` +
    `--${CREATE_BOUNDARY}--`;

  return {
    url: `${DRIVE_UPLOAD}?uploadType=multipart&fields=${fields}`,
    method: "POST",
    contentType: `multipart/related; boundary=${CREATE_BOUNDARY}`,
    body,
  };
}

const FILE_D_RE = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/;
const OPEN_ID_RE = /^https:\/\/drive\.google\.com\/open\?id=([\w-]+)/;

export function extractDriveFileId(url: string): string | null {
  const m = FILE_D_RE.exec(url) ?? OPEN_ID_RE.exec(url);
  return m ? m[1] : null;
}
