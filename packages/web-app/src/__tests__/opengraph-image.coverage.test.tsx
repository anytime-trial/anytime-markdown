jest.mock("next/og", () => ({
  ImageResponse: class MockImageResponse {
    constructor(public element: any, public options: any) {}
  },
}));

import OGImage, { runtime, alt, size, contentType } from "../app/opengraph-image";

describe("opengraph-image", () => {
  it("exports correct metadata", () => {
    expect(runtime).toBe("nodejs");
    expect(alt).toBe("Anytime Markdown - Browser-based Markdown Editor");
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
  });

  it("returns an ImageResponse", () => {
    const result = OGImage();
    expect(result).toBeDefined();
    expect((result as any).options).toEqual({ width: 1200, height: 630 });
  });
});
