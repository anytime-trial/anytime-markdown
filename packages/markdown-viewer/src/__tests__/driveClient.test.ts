import {
  buildDriveCreateRequest,
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

describe("buildDriveCreateRequest", () => {
  it("multipart で name と本文を含む POST リクエストを組み立てる", () => {
    const req = buildDriveCreateRequest("note.md", "# hello");
    expect(req.method).toBe("POST");
    expect(req.url).toBe(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CheadRevisionId",
    );
    expect(req.contentType).toMatch(/^multipart\/related; boundary=/);
    const boundary = /boundary=(.+)$/.exec(req.contentType!)![1];
    expect(req.body).toContain(`--${boundary}`);
    expect(req.body).toContain('"name":"note.md"');
    expect(req.body).toContain("# hello");
    expect(req.body!.endsWith(`--${boundary}--`)).toBe(true);
  });

  it("parentId を渡すと parents に含める", () => {
    const req = buildDriveCreateRequest("note.md", "x", "folder-1");
    expect(req.body).toContain('"parents":["folder-1"]');
  });

  it("parentId 未指定なら parents を含めない（マイドライブ直下）", () => {
    const req = buildDriveCreateRequest("note.md", "x");
    expect(req.body).not.toContain("parents");
  });

  it("ファイル名の引用符・改行が JSON エスケープされる", () => {
    const req = buildDriveCreateRequest('a"b\nc.md', "x");
    expect(req.body).toContain('"name":"a\\"b\\nc.md"');
  });
});
