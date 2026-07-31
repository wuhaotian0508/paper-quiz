import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ResultsView } from "./results-view";

const quiz = {
  title: "Probability quiz",
  summary: "Review.",
  questions: [
    {
      id: "q1",
      type: "multiple_choice" as const,
      prompt: "Pick B.",
      options: [
        { id: "a" as const, text: "A" },
        { id: "b" as const, text: "B" },
        { id: "c" as const, text: "C" },
        { id: "d" as const, text: "D" },
      ],
      correctOptionId: "b" as const,
      explanation: "B.",
      sourceNote: "Lecture",
    },
  ],
};

it("offers the finished quiz as a shareable challenge and reports the share status", () => {
  const onShare = vi.fn();
  render(
    <ResultsView
      quiz={quiz}
      grades={{}}
      mistakeCount={0}
      shareStatus="Challenge link copied. It expires in 7 days."
      onShare={onShare}
      onOpenMistakes={vi.fn()}
      onRestart={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Share challenge" }));
  expect(onShare).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toHaveTextContent("Challenge link copied");
});
