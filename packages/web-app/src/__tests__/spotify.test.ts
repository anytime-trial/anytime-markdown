import { generatePlaylistName, chunkArray } from "../lib/spotify";

describe("generatePlaylistName", () => {
  it("現在の年月を含むプレイリスト名を生成する", () => {
    const name = generatePlaylistName();
    expect(name).toMatch(/^\d{4}年\d{1,2}月 話題の曲$/);
  });
});

describe("chunkArray", () => {
  it("100件以下の配列はそのまま1チャンクで返す", () => {
    const arr = Array.from({ length: 50 }, (_, i) => `uri:${i}`);
    expect(chunkArray(arr, 100)).toEqual([arr]);
  });

  it("101件の配列を100件と1件に分割する", () => {
    const arr = Array.from({ length: 101 }, (_, i) => `uri:${i}`);
    const chunks = chunkArray(arr, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(1);
  });
});
