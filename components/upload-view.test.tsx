import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UploadView } from "./upload-view";
import type { DailyReviewPaper } from "@/lib/daily-review";
import type { MistakeBookEntry } from "@/lib/mistake-book";

afterEach(cleanup);

const entry = (id: string): MistakeBookEntry => ({
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
});

const baseProps = {
  files: [],
  error: "",
  counts: { multiple_choice: 1, fill_blank: 0, short_answer: 0 },
  brief: "",
  loading: false,
  mistakeCount: 2,
  sessionCount: 1,
  materialCount: 1,
  sessions: [],
  onAcceptFiles: vi.fn(),
  onCountsChange: vi.fn(),
  onBriefChange: vi.fn(),
  onOpenMistakes: vi.fn(),
  onOpenProgress: vi.fn(),
  onOpenLibrary: vi.fn(),
  onOpenSession: vi.fn(),
  onPasteNotes: vi.fn(),
  onStart: vi.fn(),
};

it("uses a two-column desktop upload layout so the quiz setup stays compact", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

  expect(stylesheet).toContain("@media (min-width: 1100px)");
  expect(stylesheet).toContain(".dashboard-upload-panel {");
  expect(stylesheet).toContain("grid-template-columns: minmax(290px, 0.8fr) minmax(0, 1.2fr);");
});

it("shows one review paper for each course with questions due", () => {
  const papers: DailyReviewPaper[] = [
    { subject: "UGBA 117", entries: [entry("a"), entry("b")], dueCount: 2, overdueCount: 1 },
    { subject: "MATH 1A", entries: [entry("c")], dueCount: 1, overdueCount: 0 },
  ];

  render(<UploadView {...baseProps} papers={papers} onSitPaper={vi.fn()} />);

  expect(screen.getByRole("heading", { name: "Today's review" })).toBeInTheDocument();
  expect(screen.getByText("UGBA 117")).toBeInTheDocument();
  expect(screen.getByText("MATH 1A")).toBeInTheDocument();
  expect(screen.getByText("1 overdue")).toBeInTheDocument();
});

it("hands the paper's questions to the practice flow when a review is started", () => {
  const onSitPaper = vi.fn();
  const questions = [entry("a"), entry("b")];

  render(
    <UploadView
      {...baseProps}
      papers={[{ subject: "UGBA 117", entries: questions, dueCount: 2, overdueCount: 0 }]}
      onSitPaper={onSitPaper}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start review" }));

  expect(onSitPaper).toHaveBeenCalledWith(questions);
});

it("says so plainly when nothing is due today", () => {
  render(<UploadView {...baseProps} papers={[]} onSitPaper={vi.fn()} />);

  expect(screen.getByRole("heading", { name: "Today's review" })).toBeInTheDocument();
  expect(
    screen.getByText("Nothing due today. New mistakes come back tomorrow."),
  ).toBeInTheDocument();
});

it("notes when a course has more due than one paper hands out", () => {
  render(
    <UploadView
      {...baseProps}
      papers={[{ subject: "UGBA 117", entries: [entry("a")], dueCount: 9, overdueCount: 0 }]}
      onSitPaper={vi.fn()}
    />,
  );

  expect(screen.getByText("+8 queued for tomorrow")).toBeInTheDocument();
});
