import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewLibrary } from "./review-library";

afterEach(cleanup);

describe("ReviewLibrary", () => {
  it("renders one review card per PDF with its stats and open action", () => {
    render(
      <ReviewLibrary
        materials={[
          {
            id: "lecture.pdf::100",
            name: "Lecture.pdf",
            questions: [],
            mistakes: [],
            sessions: [],
            lastPracticedAt: "2026-08-05T10:00:00.000Z",
          },
        ]}
        library={[
          {
            id: "lecture.pdf::100",
            name: "Lecture.pdf",
            uploadedAt: "2026-08-05T09:00:00.000Z",
            lastOpenedAt: "",
          },
        ]}
        onOpen={vi.fn()}
        onViewAll={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your review sheets by document" })).toBeInTheDocument();
    expect(screen.getByText("Lecture.pdf")).toBeInTheDocument();
    expect(screen.getByText("Mistakes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Lecture.pdf review sheet" })).toBeInTheDocument();
  });
});
