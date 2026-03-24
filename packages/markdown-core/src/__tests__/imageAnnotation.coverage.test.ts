/**
 * imageAnnotation.ts のカバレッジテスト
 */
import {
  ANNOTATION_COLORS,
  generateAnnotationId,
  parseAnnotations,
  serializeAnnotations,
} from "../types/imageAnnotation";

describe("imageAnnotation coverage", () => {
  it("ANNOTATION_COLORS has expected colors", () => {
    expect(ANNOTATION_COLORS.length).toBe(6);
    expect(ANNOTATION_COLORS[0].label).toBe("Red");
  });

  it("generateAnnotationId returns a string", () => {
    const id = generateAnnotationId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generateAnnotationId returns unique ids", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateAnnotationId()));
    expect(ids.size).toBe(10);
  });

  it("parseAnnotations returns empty array for null", () => {
    expect(parseAnnotations(null)).toEqual([]);
  });

  it("parseAnnotations returns empty array for empty string", () => {
    expect(parseAnnotations("")).toEqual([]);
  });

  it("parseAnnotations parses valid JSON", () => {
    const annotations = [{ id: "1", type: "rect", x1: 0, y1: 0, x2: 10, y2: 10, color: "#f00" }];
    expect(parseAnnotations(JSON.stringify(annotations))).toEqual(annotations);
  });

  it("parseAnnotations returns empty array for invalid JSON", () => {
    expect(parseAnnotations("not json")).toEqual([]);
  });

  it("serializeAnnotations returns null for empty array", () => {
    expect(serializeAnnotations([])).toBeNull();
  });

  it("serializeAnnotations returns JSON string", () => {
    const annotations = [{ id: "1", type: "rect" as const, x1: 0, y1: 0, x2: 10, y2: 10, color: "#f00" }];
    const result = serializeAnnotations(annotations);
    expect(result).toBe(JSON.stringify(annotations));
  });
});
