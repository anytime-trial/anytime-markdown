/**
 * version モジュールのスモークテスト（旧 smallComponents.test.tsx から分離。
 * FullPageLoader テストは markdown-react-islands へ移設）。
 */

describe("version", () => {
  it("exports a version string", async () => {
    const mod = await import("../version");
    expect(typeof mod.APP_VERSION).toBe("string");
    expect(mod.APP_VERSION.length).toBeGreaterThan(0);
  });
});
