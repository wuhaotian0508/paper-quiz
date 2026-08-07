import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuizWorkspace } from "./quiz-workspace";

const useStudySyncMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-study-sync", () => ({ useStudySync: useStudySyncMock }));

describe("QuizWorkspace", () => {
  beforeEach(() => {
    useStudySyncMock.mockReturnValue({ status: "idle", requestMistakeDeletion: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
    vi.unstubAllGlobals();
    useStudySyncMock.mockReset();
  });

  it("waits for local storage before sync and persists the merged cloud state", async () => {
    let hydrate: ((state: { sessions: object[]; mistakes: object[] }) => void) | undefined;
    useStudySyncMock.mockImplementation((options) => {
      hydrate = options.onHydrate;
      return { status: "synced", requestMistakeDeletion: vi.fn() };
    });
    render(<QuizWorkspace />);

    expect(useStudySyncMock).toHaveBeenCalledWith(expect.objectContaining({ ready: false }));
    await screen.findByRole("heading", { name: "Start a new practice set." });
    expect(useStudySyncMock).toHaveBeenLastCalledWith(expect.objectContaining({ ready: true }));

    hydrate?.({
      sessions: [
        {
          id: "cloud-session",
          title: "Cloud practice",
          createdAt: "2026-07-28T10:00:00.000Z",
          questions: [],
          answers: {},
          grades: {},
          chat: {},
          source: { fileId: null, transcript: "", materialId: "", materialName: "" },
        },
      ],
      mistakes: [],
    });

    expect(window.localStorage.getItem("paper-plane-quiz-history-v1")).toContain("cloud-session");
  });

  it("opens the help center from the help URL hash", async () => {
    window.location.hash = "#help";
    render(<QuizWorkspace />);

    expect(
      await screen.findByRole("heading", { name: "How can PaperQuiz help?" }),
    ).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: /Calendar/ }));
    expect(
      await screen.findByRole("heading", { name: "Practice tells a story." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Data Quiz")).toBeInTheDocument();
  });

  it("starts with an English study-material upload prompt", () => {
    render(<QuizWorkspace />);

    expect(screen.queryByRole("heading", { name: "Welcome back." })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Saved study data")).not.toBeInTheDocument();
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

  it("grades a combined quiz against every stored PDF source", async () => {
    const quiz = {
      title: "Combined quiz",
      summary: "Two sources.",
      sourceFileIds: ["file-lecture1", "file-homework1"],
      questions: [
        {
          id: "combined-written-1",
          type: "short_answer",
          prompt: "Connect the lecture to the homework.",
          explanation: "The homework applies the lecture framework.",
          sourceNote: "lecture-1.pdf and homework-1.pdf",
          referenceAnswer: "It applies the framework.",
          gradingCriteria: ["connects both sources"],
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
      target: {
        files: [
          new File(["%PDF-1.4"], "lecture-1.pdf", { type: "application/pdf" }),
          new File(["%PDF-1.4"], "homework-1.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Multiple-choice questions"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Short-answer questions"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate combined quiz" }));

    fireEvent.change(await screen.findByLabelText("Your answer"), {
      target: { value: "It applies the lecture framework." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await screen.findByText("Right.");
    const gradeBody = fetchMock.mock.calls[1][1].body as FormData;
    expect(JSON.parse(String(gradeBody.get("fileIds")))).toEqual([
      "file-lecture1",
      "file-homework1",
    ]);
    expect(gradeBody.get("fileId")).toBeNull();
  });

  it("re-sends every selected PDF when a combined quiz has no reusable source ids", async () => {
    const quiz = {
      title: "Combined quiz",
      summary: "Two sources.",
      questions: [
        {
          id: "combined-fallback-1",
          type: "short_answer",
          prompt: "Connect the lecture to the homework.",
          explanation: "The homework applies the lecture framework.",
          sourceNote: "lecture-1.pdf and homework-1.pdf",
          referenceAnswer: "It applies the framework.",
          gradingCriteria: ["connects both sources"],
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
      target: {
        files: [
          new File(["%PDF-1.4"], "lecture-1.pdf", { type: "application/pdf" }),
          new File(["%PDF-1.4"], "homework-1.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Multiple-choice questions"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Short-answer questions"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate combined quiz" }));

    fireEvent.change(await screen.findByLabelText("Your answer"), {
      target: { value: "It applies the lecture framework." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    await screen.findByText("Right.");
    const gradeBody = fetchMock.mock.calls[1][1].body as FormData;
    expect(gradeBody.getAll("files").map((file) => (file as File).name)).toEqual([
      "lecture-1.pdf",
      "homework-1.pdf",
    ]);
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
    fireEvent.click(await screen.findByRole("button", { name: /History/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Open PDF" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue latest practice" }));

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

  it("keeps mistakes from different quizzes separate when practising them together", async () => {
    const base = {
      version: 1,
      type: "multiple_choice",
      status: "incorrect",
      score: 0,
      feedback: "Review it.",
      missingPoints: [],
      answer: "a",
      updatedAt: "2026-07-27T12:00:00",
      source: { fileId: null, transcript: "" },
      options: [
        { id: "a", text: "Wrong" },
        { id: "b", text: "Right" },
      ],
    };
    const entry = (id: string, prompt: string) => ({
      ...base,
      id,
      question: {
        // Both quizzes numbered their first question q1.
        id: "q1",
        type: "multiple_choice",
        prompt,
        options: [
          { id: "a", text: "Wrong" },
          { id: "b", text: "Right" },
          { id: "c", text: "No" },
          { id: "d", text: "No" },
        ],
        correctOptionId: "b",
        explanation: `Explanation for ${prompt}`,
        sourceNote: "Lecture",
      },
    });
    window.localStorage.setItem(
      "paper-plane-quiz-mistakes-v1",
      JSON.stringify([
        entry("old-1", "Question from quiz one?"),
        entry("old-2", "Question from quiz two?"),
      ]),
    );
    render(<QuizWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: /Mistake Book/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Practice all" }));

    // Answer both correctly. With colliding ids the second grade overwrites the first
    // and the score reads 1 / 2 instead of 2 / 2.
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Right/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next question" }));

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Right/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "View results" }));

    expect(await screen.findByText("Correct 2 / 2")).toBeInTheDocument();
  });

  it("groups a lecture's questions and mistakes under its own file", async () => {
    const quiz = {
      title: "Forces quiz",
      summary: "A science review.",
      sourceFileId: "file-abc123",
      questions: [
        {
          id: "q1",
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
          sourceNote: "Page 1",
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
      target: {
        files: [new File(["%PDF-1.4"], "forces-lecture.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));

    // Answer it wrong so the material ends up with both a question and a mistake.
    await screen.findByRole("button", { name: /Friction/ });
    fireEvent.click(screen.getByRole("button", { name: /Friction/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "View results" }));
    fireEvent.click(await screen.findByRole("button", { name: "Upload another lecture" }));

    fireEvent.click(await screen.findByRole("button", { name: /History/ }));
    expect(await screen.findByText("forces-lecture.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open PDF" }));

    expect(await screen.findByRole("heading", { name: "forces-lecture.pdf" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What pulls objects toward Earth?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mistakes/ }));
    expect(
      screen.getByRole("heading", { name: "What pulls objects toward Earth?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open this PDF's mistakes" })).toBeEnabled();
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

  it("sends every selected PDF together when generating a combined quiz", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Combined quiz",
          summary: "Two sources.",
          questions: [
            {
              id: "combined-q1",
              type: "multiple_choice",
              prompt: "Question grounded in both PDFs?",
              options: [
                { id: "a", text: "A" },
                { id: "b", text: "B" },
                { id: "c", text: "C" },
                { id: "d", text: "D" },
              ],
              correctOptionId: "a",
              explanation: "A is correct.",
              sourceNote: "lecture-1.pdf and homework-1.pdf",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<QuizWorkspace />);

    const picker = screen.getByLabelText("Choose a PDF or lecture recording");
    fireEvent.change(picker, {
      target: {
        files: [
          new File(["%PDF-1.4"], "lecture-1.pdf", { type: "application/pdf" }),
          new File(["%PDF-1.4"], "homework-1.pdf", { type: "application/pdf" }),
        ],
      },
    });

    expect(picker).toHaveAttribute("multiple");
    expect(screen.getByText("lecture-1.pdf")).toBeInTheDocument();
    expect(screen.getByText("homework-1.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate combined quiz" }));

    await screen.findByText("Question grounded in both PDFs?");
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.getAll("files").map((file) => (file as File).name)).toEqual([
      "lecture-1.pdf",
      "homework-1.pdf",
    ]);
  });

  it("accepts files larger than the former 20 MB application limit", () => {
    render(<QuizWorkspace />);
    const largePdf = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Choose a PDF or lecture recording"), {
      target: { files: [largePdf] },
    });

    expect(screen.getByText("large.pdf")).toBeInTheDocument();
    expect(screen.queryByText(/20 MB or smaller/i)).not.toBeInTheDocument();
  });
});
