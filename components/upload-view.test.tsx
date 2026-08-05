import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UploadView } from "./upload-view";

it("uses a two-column desktop upload layout so the quiz setup stays compact", () => {
  const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

  expect(stylesheet).toContain("@media (min-width: 1100px)");
  expect(stylesheet).toContain(".dashboard-upload-panel {");
  expect(stylesheet).toContain("grid-template-columns: minmax(290px, 0.8fr) minmax(0, 1.2fr);");
});

it("shows recent PDFs with mistakes in the dashboard review focus", () => {
  render(
    <UploadView
      files={[]}
      error=""
      counts={{ multiple_choice: 1, fill_blank: 0, short_answer: 0 }}
      custom={[]}
      difficulty="mixed"
      loading={false}
      mistakeCount={2}
      sessionCount={1}
      materialCount={1}
      sessions={[]}
      reviewFocusMaterials={[
        {
          id: "material-1",
          name: "Biology.pdf",
          questions: [],
          mistakes: [{ id: "mistake-1" } as never],
          sessions: [],
          lastPracticedAt: "2026-08-05T10:00:00.000Z",
        },
      ]}
      onAcceptFiles={vi.fn()}
      onCountsChange={vi.fn()}
      onCustomChange={vi.fn()}
      onDifficultyChange={vi.fn()}
      onOpenMistakes={vi.fn()}
      onOpenProgress={vi.fn()}
      onOpenHistory={vi.fn()}
      onOpenSession={vi.fn()}
      onOpenMaterial={vi.fn()}
      onStart={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "Review focus" })).toBeInTheDocument();
  expect(screen.getByText("Biology.pdf")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Biology.pdf review" })).toBeInTheDocument();
});
