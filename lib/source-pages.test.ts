import { describe, expect, it } from "vitest";
import { dedupeSourcePages, extractPageNumber, type SourcePageImage } from "./source-pages";

describe("source page references", () => {
  it("extracts page numbers from common source citations", () => {
    expect(extractPageNumber("Education section, page 12")).toBe(12);
    expect(extractPageNumber("slide 3")).toBe(3);
    expect(extractPageNumber("第 4 页")).toBe(4);
    expect(extractPageNumber("Saved question context")).toBeNull();
  });

  it("sorts pages and shows each page once", () => {
    const pages: SourcePageImage[] = [
      { materialId: "m", pageNumber: 3, imageUrl: "three" },
      { materialId: "m", pageNumber: 1, imageUrl: "one" },
      { materialId: "m", pageNumber: 3, imageUrl: "duplicate" },
      { materialId: "m", pageNumber: 2, imageUrl: "two" },
    ];
    expect(dedupeSourcePages(pages)).toEqual([
      { materialId: "m", pageNumber: 1, imageUrl: "one" },
      { materialId: "m", pageNumber: 2, imageUrl: "two" },
      { materialId: "m", pageNumber: 3, imageUrl: "three" },
    ]);
  });
});
