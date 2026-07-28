import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MistakeBookView } from "./mistake-book-view";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { EMPTY_SOURCE } from "@/lib/study-history";

const entry: MistakeBookEntry = {
  version: 1,
  id: "q1",
  answer: "a",
  status: "incorrect",
  score: 0,
  feedback: "Review the concept.",
  missingPoints: [],
  updatedAt: "2026-07-21T12:00:00",
  source: EMPTY_SOURCE,
  question: {
    id: "q1",
    type: "multiple_choice",
    prompt: "Which answer is correct?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
    correctOptionId: "b",
    explanation: "B is correct.",
    sourceNote: "Page 1",
  },
};

describe("MistakeBookView", () => {
  it("supports selection, detail expansion, and selected practice", () => {
    const onPractice = vi.fn();
    render(
      <MistakeBookView
        entries={[entry]}
        onBack={vi.fn()}
        onChange={vi.fn()}
        onPractice={onPractice}
      />,
    );
    expect(screen.getByText("1 mistake")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select question 1"));
    fireEvent.click(screen.getByRole("button", { name: "Practice selected" }));
    expect(onPractice).toHaveBeenCalledWith([entry]);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByText(/Review the concept/)).toBeInTheDocument();
  });
});
