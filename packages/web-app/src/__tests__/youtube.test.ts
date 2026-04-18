import { generateYouTubePlaylistName } from "../lib/youtube";

describe("generateYouTubePlaylistName", () => {
  it("現在の年月を含むプレイリスト名を生成する", () => {
    const name = generateYouTubePlaylistName();
    expect(name).toMatch(/^\d{4}年\d{1,2}月 急上昇（音楽）$/);
  });
});
