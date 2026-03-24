import { detectEncoding, detectLineEnding } from "../utils/fileReading";

describe("detectEncoding", () => {
  test("UTF-8 BOM を検出する", () => {
    const buffer = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]).buffer;
    expect(detectEncoding(buffer)).toEqual({ encoding: "UTF-8 (BOM)", bomLength: 3 });
  });

  test("UTF-16 LE BOM を検出する", () => {
    const buffer = new Uint8Array([0xff, 0xfe, 0x41, 0x00]).buffer;
    expect(detectEncoding(buffer)).toEqual({ encoding: "UTF-16 LE", bomLength: 2 });
  });

  test("UTF-16 BE BOM を検出する", () => {
    const buffer = new Uint8Array([0xfe, 0xff, 0x00, 0x41]).buffer;
    expect(detectEncoding(buffer)).toEqual({ encoding: "UTF-16 BE", bomLength: 2 });
  });

  test("BOM なしを UTF-8 と判定する", () => {
    const buffer = new Uint8Array([0x41, 0x42, 0x43]).buffer;
    expect(detectEncoding(buffer)).toEqual({ encoding: "UTF-8", bomLength: 0 });
  });

  test("空バッファを UTF-8 と判定する", () => {
    const buffer = new Uint8Array([]).buffer;
    expect(detectEncoding(buffer)).toEqual({ encoding: "UTF-8", bomLength: 0 });
  });
});

describe("detectLineEnding", () => {
  test("LF のみを検出する", () => {
    expect(detectLineEnding("line1\nline2\nline3")).toBe("LF");
  });

  test("CRLF のみを検出する", () => {
    expect(detectLineEnding("line1\r\nline2\r\nline3")).toBe("CRLF");
  });

  test("CR のみを検出する", () => {
    expect(detectLineEnding("line1\rline2\rline3")).toBe("CR");
  });

  test("改行なしで N/A を返す", () => {
    expect(detectLineEnding("no newlines")).toBe("N/A");
  });

  test("空文字列で N/A を返す", () => {
    expect(detectLineEnding("")).toBe("N/A");
  });

  test("混在を Mixed として検出する", () => {
    expect(detectLineEnding("line1\r\nline2\nline3")).toBe("Mixed");
  });
});
