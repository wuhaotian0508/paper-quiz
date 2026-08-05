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

it("separates downloads from sharing and exposes the created URL", () => {
  const onShare = vi.fn();
  render(
    <ResultsView
      quiz={quiz}
      grades={{}}
      mistakeCount={0}
      shareStatus="Challenge link copied. It expires in 7 days."
      shareUrl="https://paperquiz.test/challenge/share-123"
      onShare={onShare}
      onCopyShare={vi.fn()}
      onOpenShare={vi.fn()}
      onOpenMistakes={vi.fn()}
      onRestart={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "Downloads" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Share" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create share link" }));
  expect(onShare).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toHaveTextContent("Challenge link copied");
  expect(screen.getByLabelText("Share link")).toHaveValue("https://paperquiz.test/challenge/share-123");
  expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open link" })).toHaveAttribute(
    "href",
    "https://paperquiz.test/challenge/share-123",
  );
});
