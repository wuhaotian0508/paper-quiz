import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudyMaterial } from "@/lib/study-material";
import { HistoryView } from "./history-view";

const pdf: StudyMaterial = {
  id: "lecture-5",
  name: "Lecture 5 - Strategy.pdf",
  sessions: [],
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "What does a moat protect?",
      options: [
        { id: "a", text: "A competitive advantage" },
        { id: "b", text: "A calendar" },
      ],
      correctOptionId: "a",
      explanation: "It protects sustainable advantage.",
      sourceNote: "Page 4",
    },
  ],
  mistakes: [],
  lastPracticedAt: "2026-07-29T12:00:00.000Z",
};

describe("HistoryView", () => {
  it("groups history by PDF and opens that PDF's question collection", () => {
    const onOpen = vi.fn();
    render(<HistoryView materials={[pdf]} onBack={vi.fn()} onOpen={onOpen} />);

    expect(screen.getByRole("heading", { name: "Your PDF question history." })).toBeInTheDocument();
    expect(screen.getByText("Lecture 5 - Strategy.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "SMALL" &&
          element.textContent?.includes("1 saved question") === true,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(onOpen).toHaveBeenCalledWith(pdf);
  });
});
