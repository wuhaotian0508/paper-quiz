import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { ReviewSheetView } from "./review-sheet-view";

const readSourcePageImages = vi.hoisted(() => vi.fn());
vi.mock("@/lib/source-pages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/source-pages")>()),
  readSourcePageImages,
}));

function entry(id: string, materialId: string, sourceNote: string): MistakeBookEntry {
  return {
    version: 1,
    id,
    status: "incorrect",
    score: 0,
    feedback: `Feedback for ${id}`,
    missingPoints: [],
    updatedAt: "2026-08-05T10:00:00.000Z",
    answer: "wrong",
    source: { fileId: null, transcript: "", materialId, materialName: "Lecture.pdf" },
    question: {
      id,
      type: "multiple_choice",
      prompt: `Question ${id}`,
      explanation: `Explanation ${id}`,
      sourceNote,
      options: [
        { id: "a", text: "Wrong" },
        { id: "b", text: "Right" },
        { id: "c", text: "No" },
        { id: "d", text: "No" },
      ],
      correctOptionId: "b",
    },
  } as MistakeBookEntry;
}

const slide = (materialId: string, pageNumber: number) => ({
  materialId,
  pageNumber,
  imageUrl: `data:image/jpeg;base64,${materialId}-${pageNumber}`,
});

describe("ReviewSheetView", () => {
  afterEach(() => {
    cleanup();
    readSourcePageImages.mockReset();
  });

  it("shows the source slide for a weakness that cites a page", async () => {
    readSourcePageImages.mockResolvedValue([slide("m1", 5)]);
    render(
      <ReviewSheetView
        entries={[entry("w1", "m1", "Page 5, Different types of AI")]}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(await screen.findByAltText("Source slide, page 5")).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,m1-5",
    );
    expect(screen.getByText("Page 5")).toBeInTheDocument();
  });

  it("loads slides from every PDF the weaknesses came from", async () => {
    readSourcePageImages.mockImplementation((materialId: string) =>
      Promise.resolve(materialId === "m1" ? [slide("m1", 2)] : [slide("m2", 7)]),
    );
    render(
      <ReviewSheetView
        entries={[entry("w1", "m1", "Page 2"), entry("w2", "m2", "Page 7")]}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    // The exam review sheet works from one material; a mistake book spans several.
    expect(await screen.findByAltText("Source slide, page 2")).toBeInTheDocument();
    expect(screen.getByAltText("Source slide, page 7")).toBeInTheDocument();
    expect(readSourcePageImages.mock.calls.map(([id]) => id).sort()).toEqual(["m1", "m2"]);
  });

  it("does not confuse the same page number across two different PDFs", async () => {
    readSourcePageImages.mockImplementation((materialId: string) =>
      Promise.resolve(materialId === "m1" ? [slide("m1", 3)] : []),
    );
    render(
      <ReviewSheetView
        entries={[entry("w1", "m1", "Page 3"), entry("w2", "m2", "Page 3")]}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(await screen.findByAltText("Source slide, page 3")).toBeInTheDocument();
    // m2 has no rendered page 3, so it must not borrow m1's.
    expect(screen.getAllByAltText("Source slide, page 3")).toHaveLength(1);
    expect(screen.getByText("Slide unavailable")).toBeInTheDocument();
  });

  it("enlarges a slide and closes the preview again", async () => {
    readSourcePageImages.mockResolvedValue([slide("m1", 5)]);
    render(
      <ReviewSheetView
        entries={[entry("w1", "m1", "Page 5")]}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Enlarge source slide, page 5" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByAltText("Enlarged source slide, page 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close slide preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the original layout when no weakness has a rendered slide", async () => {
    readSourcePageImages.mockResolvedValue([]);
    render(
      <ReviewSheetView
        entries={[entry("w1", "m1", "Private lecture")]}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(await screen.findByText("Question w1")).toBeInTheDocument();
    // Reserving a slide column that can never fill would just be dead space.
    expect(screen.queryByText("Slide unavailable")).not.toBeInTheDocument();
  });

  it("still renders when a mistake predates source tracking", async () => {
    render(
      <ReviewSheetView
        entries={[entry("w1", "", "Page 5")]}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(screen.getByText("Question w1")).toBeInTheDocument();
    expect(readSourcePageImages).not.toHaveBeenCalled();
  });
});
