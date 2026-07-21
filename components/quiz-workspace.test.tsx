import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizWorkspace } from "./quiz-workspace";

describe("QuizWorkspace", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts with an English study-material upload prompt", () => {
    render(<QuizWorkspace />);

    expect(screen.getByRole("heading", { name: /Turn a lecture into a quiz/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Choose a PDF or lecture recording")).toHaveAttribute("accept", expect.stringContaining("audio/mpeg"));
    expect(screen.getAllByText(/PDF or lecture recording/i)).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /Generate quiz/i })).toBeDisabled();
    expect(screen.getByLabelText("Multiple-choice questions")).toHaveValue(5);
    expect(screen.getByLabelText("Fill-blank questions")).toHaveValue(0);
    expect(screen.getByRole("button", { name: /Add custom question type/i })).toBeInTheDocument();
  });

  it("transcribes an audio upload before offering quiz generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transcript: "A lecture transcript about RAG." }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<QuizWorkspace />);

    fireEvent.change(screen.getByLabelText("Choose a PDF or lecture recording"), {
      target: { files: [new File(["audio"], "lecture.webm", { type: "audio/webm" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Transcribe recording/i }));

    expect(await screen.findByLabelText("Lecture transcript")).toHaveValue("A lecture transcript about RAG.");
    expect(fetchMock).toHaveBeenCalledWith("/api/transcribe", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("button", { name: /Generate quiz from transcript/i })).toBeEnabled();
  });
});
