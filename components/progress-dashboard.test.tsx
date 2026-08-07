import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProgressDashboard } from "./progress-dashboard";
import type { MistakeBookEntry } from "@/lib/mistake-book";
import { createReviewState, reviewDateKey, type ReviewState } from "@/lib/review-schedule";

afterEach(cleanup);

const mistake = (id: string, review: ReviewState): MistakeBookEntry => ({
  version: 1,
  id,
  question: {
    id: "q1",
    type: "fill_blank",
    prompt: `${id} ____`,
    acceptedAnswers: ["x"],
    referenceAnswer: "x",
    explanation: "x",
    sourceNote: "Lecture",
  },
  answer: "wrong",
  status: "incorrect",
  score: 0,
  feedback: "Review it.",
  missingPoints: [],
  updatedAt: "2026-08-01T09:00:00.000Z",
  source: { fileId: null, transcript: "", materialId: "m1", materialName: "m1.pdf" },
  review,
});

/** A state whose due date is `days` from now, so the assertions do not depend on the date. */
const dueIn = (days: number): ReviewState => {
  const due = new Date();
  due.setDate(due.getDate() + days);
  due.setHours(0, 0, 0, 0);
  return { ...createReviewState(new Date()), dueAt: due.toISOString() };
};

it("offers to start today's review when questions are due", () => {
  const onReview = vi.fn();
  const due = [mistake("a", dueIn(0)), mistake("b", dueIn(-3))];

  render(
    <ProgressDashboard
      sessions={[]}
      mistakes={due}
      onBack={vi.fn()}
      onOpen={vi.fn()}
      onReview={onReview}
    />,
  );
  expect(screen.getByText("2 questions due for review today")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start review" }));

  // Most overdue first, which is the order the review queue hands them back in.
  expect(onReview).toHaveBeenCalledWith([
    expect.objectContaining({ id: "b" }),
    expect.objectContaining({ id: "a" }),
  ]);
});

it("marks upcoming review dates on the calendar without offering to start them", () => {
  const { container } = render(
    <ProgressDashboard
      sessions={[]}
      mistakes={[mistake("later", dueIn(2))]}
      onBack={vi.fn()}
      onOpen={vi.fn()}
      onReview={vi.fn()}
    />,
  );

  expect(container.querySelectorAll(".calendar-due")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Start review" })).not.toBeInTheDocument();
});

it("collapses an overdue card onto today rather than the day it was missed", () => {
  const { container } = render(
    <ProgressDashboard
      sessions={[]}
      mistakes={[mistake("missed", dueIn(-10))]}
      onBack={vi.fn()}
      onOpen={vi.fn()}
      onReview={vi.fn()}
    />,
  );

  const todayCell = container.querySelector(".calendar-grid > button.is-today");
  expect(todayCell?.querySelector(".calendar-due")?.textContent).toBe("1");
  expect(todayCell?.className).toContain("has-due");
});

it("says nothing is due when the mistake book is empty", () => {
  render(
    <ProgressDashboard
      sessions={[]}
      mistakes={[]}
      onBack={vi.fn()}
      onOpen={vi.fn()}
      onReview={vi.fn()}
    />,
  );

  expect(screen.queryByRole("button", { name: "Start review" })).not.toBeInTheDocument();
  expect(screen.getByText("No completed practice recorded for this day.")).toBeInTheDocument();
});

it("opens on today, so the calendar answers what is owed now", () => {
  const { container } = render(
    <ProgressDashboard
      sessions={[]}
      mistakes={[]}
      onBack={vi.fn()}
      onOpen={vi.fn()}
      onReview={vi.fn()}
    />,
  );

  const selected = container.querySelector(".calendar-grid > button.is-selected");
  expect(selected?.className).toContain("is-today");
  expect(selected?.querySelector("strong")?.textContent).toBe(
    String(Number(reviewDateKey(new Date()).slice(8))),
  );
});
