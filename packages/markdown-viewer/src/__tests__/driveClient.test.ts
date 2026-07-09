import {
  buildDriveMetaRequest,
  buildDriveMediaRequest,
  buildDriveUpdateRequest,
  extractDriveFileId,
} from "../fs/driveClient";

describe("driveClient builders", () => {
  it("メタ取得: fields に name,headRevisionId を含む GET", () => {
    const req = buildDriveMetaRequest("FILE_ID");
    expect(req.url).toBe(
      "https://www.googleapis.com/drive/v3/files/FILE_ID?fields=name%2CheadRevisionId",
    );
    expect(req.method).toBe("GET");
  });
  it("本文取得: alt=media の GET", () => {
    expect(buildDriveMediaRequest("FILE_ID").url).toBe(
      "https://www.googleapis.com/drive/v3/files/FILE_ID?alt=media",
    );
  });
  it("更新: uploadType=media の PATCH で text/markdown ボディ", () => {
    const req = buildDriveUpdateRequest("FILE_ID", "# hello");
    expect(req.url).toBe(
      "https://www.googleapis.com/upload/drive/v3/files/FILE_ID?uploadType=media",
    );
    expect(req.method).toBe("PATCH");
    expect(req.contentType).toBe("text/markdown");
    expect(req.body).toBe("# hello");
  });
  it("fileId の URL エンコード", () => {
    expect(buildDriveMetaRequest("a/b").url).toContain("files/a%2Fb");
  });
});

describe("extractDriveFileId", () => {
  it("drive.google.com/file/d/<id>/view から抽出", () => {
    expect(
      extractDriveFileId("https://drive.google.com/file/d/1AbC_-xyz/view?usp=sharing"),
    ).toBe("1AbC_-xyz");
  });
  it("open?id= 形式から抽出", () => {
    expect(extractDriveFileId("https://drive.google.com/open?id=1AbC")).toBe("1AbC");
  });
  it("Drive 以外の URL は null", () => {
    expect(extractDriveFileId("https://example.com/file/d/123")).toBeNull();
  });
});
