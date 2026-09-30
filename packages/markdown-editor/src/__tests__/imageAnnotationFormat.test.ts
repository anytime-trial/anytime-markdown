import {
  buildAnnotationKey,
  extractImageAnnotationBlock,
  parseAnnotationKey,
} from "../types/imageAnnotation";

describe("imageAnnotation の保存形式", () => {
  describe("buildAnnotationKey", () => {
    it("100 文字以下の src はそのまま通し番号と組にする", () => {
      expect(buildAnnotationKey(0, "images/a.png")).toBe("img0:images/a.png");
    });

    it("100 文字を超える src は先頭 20 文字に切り詰める", () => {
      const src = "data:image/png;base64," + "A".repeat(200);
      expect(buildAnnotationKey(3, src)).toBe(`img3:${src.slice(0, 20)}`);
    });

    it("ちょうど 100 文字の src は切り詰めない", () => {
      const src = "a".repeat(100);
      expect(buildAnnotationKey(1, src)).toBe(`img1:${src}`);
    });
  });

  describe("parseAnnotationKey", () => {
    it("通し番号と src（またはその先頭）に分解する", () => {
      expect(parseAnnotationKey("img12:images/a:b.png")).toEqual({ index: 12, srcKey: "images/a:b.png" });
    });

    it("形式に合わないキーは null", () => {
      expect(parseAnnotationKey("image0:a.png")).toBeNull();
      expect(parseAnnotationKey("img:a.png")).toBeNull();
      expect(parseAnnotationKey("imgx:a.png")).toBeNull();
    });
  });

  describe("extractImageAnnotationBlock", () => {
    it("末尾ブロックをキー→JSON 文字列の Map と、ブロックを除いた本文に分ける", () => {
      const md = "# T\n\n![a](a.png)\n<!-- image-comments\nimg0:a.png=[{\"id\":\"x\"}]\n-->";
      const { imageAnnotations, body, lines } = extractImageAnnotationBlock(md);
      expect(body).toBe("# T\n\n![a](a.png)");
      expect([...imageAnnotations]).toEqual([["img0:a.png", "[{\"id\":\"x\"}]"]]);
      expect(lines).toEqual([{ key: "img0:a.png", data: "[{\"id\":\"x\"}]" }]);
    });

    it("ブロックが無ければ空で本文は元のまま", () => {
      const { imageAnnotations, body, malformed } = extractImageAnnotationBlock("text");
      expect(imageAnnotations.size).toBe(0);
      expect(body).toBe("text");
      expect(malformed).toEqual([]);
    });

    it("= の無い行は malformed として返し、Map には入れない", () => {
      const md = "x\n<!-- image-comments\nbroken line\nimg0:a.png=[]\n-->";
      const { imageAnnotations, malformed } = extractImageAnnotationBlock(md);
      expect(imageAnnotations.size).toBe(1);
      expect(malformed).toEqual(["broken line"]);
    });

    it("閉じ --> が無いブロックは抽出しない", () => {
      const md = "x\n<!-- image-comments\nimg0:a.png=[]";
      const { imageAnnotations, body } = extractImageAnnotationBlock(md);
      expect(imageAnnotations.size).toBe(0);
      expect(body).toBe(md);
    });
  });
});
