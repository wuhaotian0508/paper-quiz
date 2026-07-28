import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizWorkspace } from "./quiz-workspace";

describe("QuizWorkspace", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows saved practice on the progress calendar", async () => {
    window.localStorage.setItem(
      "paper-plane-quiz-history-v1",
      JSON.stringify([
        {
          id: "s1",
          title: "Data Quiz",
          createdAt: "2026-07-21T12:00:00",
          questions: [],
          answers: {},
          grades: {},
          chat: {},
        },
      ]),
    );
    render(<QuizWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /Progress and calendar/i }));
    expect(
      await screen.findByRole("heading", { name: "Practice tells a story." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Data Quiz")).toBeInTheDocument();
  });

  it("starts with an English study-material upload prompt", () => {
    render(<QuizWorkspace />);

    expect(
      screen.getByRole("heading", { name: /Turn a lecture into a quiz/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Choose a PDF or lecture recording")).toHaveAttribute(
      "accept",
      expect.stringContaining("audio/mpeg"),
    );
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

    expect(await screen.findByLabelText("Lecture transcript")).toHaveValue(
      "A lecture transcript about RAG.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transcribe",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("button", { name: /Generate quiz from transcript/i })).toBeEnabled();
  });

  it("offers separate student-copy and answer-key PDF exports after generating a quiz", async () => {
    const quiz = {
      title: "Forces quiz",
      summary: "A science review.",
      questions: [
        {
          id: "force-1",
          type: "multiple_choice",
          prompt: "What pulls objects toward Earth?",
          options: [
            { id: "a", text: "Friction" },
            { id: "b", text: "Gravity" },
            { id: "c", text: "Heat" },
            { id: "d", text: "Light" },
          ],
          correctOptionId: "b",
          explanation: "Gravity pulls objects with mass.",
          sourceNote: "Forces handout",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(quiz), { headers: { "content-type": "application/json" } }),
        ),
    );
    render(<QuizWorkspace />);

    fireEvent.change(screen.getByLabelText("Choose a PDF or lecture recording"), {
      target: { files: [new File(["%PDF-1.4"], "lecture.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));

    expect(
      await screen.findByRole("button", { name: "Student copy (no answers)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer key (with answers)" })).toBeInTheDocument();
  });

  it("reports an actionable error when all question counts are zero", async () => {
    render(<QuizWorkspace />);
    fireEvent.change(screen.getByLabelText("Choose a PDF or lecture recording"), {
      target: { files: [new File(["pdf"], "lecture.pdf", { type: "application/pdf" })] },
    });
    fireEvent.change(screen.getByLabelText("Multiple-choice questions"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
    expect(await screen.findByText("Choose at least one question.")).toBeInTheDocument();
  });

  it("grades written answers against the stored file id instead of re-sending the PDF", async () => {
    const quiz = {
      title: "RAG quiz",
      summary: "A review.",
      sourceFileId: "file-abc123",
      questions: [
        {
          id: "rag-1",
          type: "short_answer",
          prompt: "Explain retrieval augmentation.",
          explanation: "Retrieval grounds the model.",
          sourceNote: "Lecture 3",
          referenceAnswer: "Retrieval-augmented generation",
          gradingCriteria: ["mentions retrieval"],
          customLabel: null,
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(quiz), { headers: { "content-type": "application/json" } }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "correct", score: 1, feedback: "Right.", missingPoints: [] }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<QuizWorkspace />);

    fireEvent.change(screen.getByLabelText("Choose a PDF or lecture recording"), {
      target: { files: [new File(["%PDF-1.4"], "lecture.pdf", { type: "application/pdf" })] },
    });
    fireEvent.change(screen.getByLabelText("Multiple-choice questions"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Short-answer questions"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));

    const field = await screen.findByLabelText("Your answer");
    fireEvent.change(field, { target: { value: "It retrieves documents first." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await screen.findByText("Right.");
    const gradeBody = fetchMock.mock.calls[1][1].body as FormData;
    expect(gradeBody.get("fileId")).toBe("file-abc123");
    expect(gradeBody.get("file")).toBeNull();
  });

  it("explains that a resumed written question needs its lecture back", async () => {
    window.localStorage.setItem(
      "paper-plane-quiz-history-v1",
      JSON.stringify([
        {
          id: "s1",
          title: "RAG quiz",
          createdAt: "2026-07-27T12:00:00",
          answers: {},
          grades: {},
          chat: {},
          source: { fileId: null, transcript: "" },
          questions: [
            {
              id: "rag-1",
              type: "short_answer",
              prompt: "Explain retrieval augmentation.",
              explanation: "Retrieval grounds the model.",
              sourceNote: "Lecture 3",
              referenceAnswer: "Retrieval-augmented generation",
              gradingCriteria: ["mentions retrieval"],
              customLabel: null,
            },
          ],
        },
      ]),
    );
    render(<QuizWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /Resume a practice set/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));

    fireEvent.change(await screen.findByLabelText("Your answer"), {
      target: { value: "It retrieves documents." },
    });
    expect(screen.getByText(/no longer loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDisabled();
  });

  it("reports a timeout with its real cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        // Mimic the platform cutting the request off: reject with the abort signal set.
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<QuizWorkspace />);

    fireEvent.change(screen.getByLabelText("Choose a PDF or lecture recording"), {
      target: { files: [new File(["%PDF-1.4"], "lecture.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
    await vi.advanceTimersByTimeAsync(61_000);
    vi.useRealTimers();

    expect(await screen.findByText(/ran past the 60 second limit/i)).toBeInTheDocument();
  });

  it("accepts a dropped study file", () => {
    render(<QuizWorkspace />);
    const zone = screen.getByText(/Drop in a PDF or lecture recording/i).closest("label");
    expect(zone).not.toBeNull();
    fireEvent.drop(zone!, {
      dataTransfer: { files: [new File(["pdf"], "lecture.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByText("lecture.pdf")).toBeInTheDocument();
  });
});
