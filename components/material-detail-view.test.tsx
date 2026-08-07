import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialDetailView } from "./material-detail-view";

const getSupabaseBrowserClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/browser", () => ({ getSupabaseBrowserClient }));

describe("MaterialDetailView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    getSupabaseBrowserClient.mockReset();
  });

  it("uses a dedicated two-column layout for question cards", () => {
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [
            {
              id: "q1",
              type: "multiple_choice",
              prompt: "Which document is required?",
              options: [
                { id: "a", text: "Passport" },
                { id: "b", text: "Visa" },
                { id: "c", text: "Form" },
                { id: "d", text: "None" },
              ],
              correctOptionId: "a",
              explanation: "The guide says passport.",
              sourceNote: "Page 10",
            },
          ],
          mistakes: [],
          sessions: [],
          lastPracticedAt: "",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(screen.getByRole("article")).toHaveClass("is-question");
  });

  it("shows this PDF's generated practice sets and a clear source-grounded review action", () => {
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [
            {
              id: "q1",
              type: "fill_blank",
              prompt: "A source is ___.",
              acceptedAnswers: ["evidence"],
              referenceAnswer: "evidence",
              explanation: "It grounds review.",
              sourceNote: "Saved PDF question context",
            },
          ],
          mistakes: [],
          sessions: [
            {
              id: "s1",
              title: "Lecture quiz 1",
              createdAt: "2026-08-05T10:00:00.000Z",
              questions: [],
              answers: {},
              grades: {},
              chat: {},
              source: {
                fileId: "file-lecture123",
                transcript: "",
                materialId: "m1",
                materialName: "Lecture.pdf",
              },
            },
          ],
          lastPracticedAt: "2026-08-05T10:00:00.000Z",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
        onOpenSession={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Practice sets from this PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Lecture quiz 1" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate knowledge-point review sheet" }),
    ).toHaveTextContent("Generate knowledge-point review sheet");
  });

  it("places a knowledge-point review builder before the raw question history", () => {
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [
            {
              id: "q1",
              type: "fill_blank",
              prompt: "A source-grounded review should cover ___.",
              acceptedAnswers: ["key concepts"],
              referenceAnswer: "key concepts",
              explanation: "A review sheet synthesizes concepts, not just answers.",
              sourceNote: "Page 1",
            },
          ],
          mistakes: [],
          sessions: [],
          lastPracticedAt: "",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Build your AI Review Sheet" })).toBeInTheDocument();
    expect(screen.getByText("Key concepts, common confusions, and targeted recall from this PDF.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate knowledge-point review sheet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open this PDF's mistakes" })).toBeInTheDocument();
  });

  it("can generate a review from saved quiz questions when the original PDF source expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Saved-question review",
            topics: Array.from({ length: 4 }, (_, index) => ({
              topic: `Topic ${index + 1}`,
              keyIdeas: ["Use the saved PDF question evidence."],
              formulaOrProcedure: "",
              commonConfusion: "Do not confuse the concepts.",
              sourceNote: "Saved quiz question",
              relatedMistakeIds: [],
              mistakeFocus: "",
            })),
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [
            {
              id: "q1",
              type: "fill_blank",
              prompt: "Evidence comes from ___.",
              acceptedAnswers: ["sources"],
              referenceAnswer: "sources",
              explanation: "The PDF grounds the answer.",
              sourceNote: "Page 1",
            },
          ],
          mistakes: [],
          sessions: [],
          lastPracticedAt: "",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate knowledge-point review sheet" }));

    expect(await screen.findByText("Saved-question review")).toBeInTheDocument();
    const form = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as FormData;
    expect(String(form.get("questionContext"))).toContain("Evidence comes from");
  });

  it("lets the learner attach the original PDF when saved question context has no page references", () => {
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [
            {
              id: "q1",
              type: "fill_blank",
              prompt: "A source is ___.",
              acceptedAnswers: ["evidence"],
              referenceAnswer: "evidence",
              explanation: "It grounds review.",
              sourceNote: "Saved PDF question context",
            },
          ],
          mistakes: [],
          sessions: [],
          lastPracticedAt: "",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Attach original PDF for source pages")).toBeInTheDocument();
  });

  it("keeps this PDF's saved mistakes visible when its old question list has expired", () => {
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [],
          mistakes: [
            {
              version: 1,
              id: "m1",
              question: {
                id: "q1",
                type: "fill_blank",
                prompt: "A durable advantage can come from ___.",
                acceptedAnswers: ["switching costs"],
                referenceAnswer: "Switching costs",
                explanation: "They retain customers.",
                sourceNote: "Page 24",
              },
              answer: "network effects",
              status: "incorrect",
              score: 0,
              feedback: "Review durable advantages.",
              missingPoints: ["Switching costs retain customers."],
              updatedAt: "2026-07-29T10:00:00.000Z",
              source: {
                fileId: null,
                transcript: "",
                materialId: "m1",
                materialName: "Lecture.pdf",
              },
            },
          ],
          sessions: [],
          lastPracticedAt: "2026-07-29T10:00:00.000Z",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open this PDF's mistakes" }));
    expect(screen.getByRole("button", { name: "Mistakes 1" })).toHaveClass("is-active");
    expect(screen.getByText("A durable advantage can come from ___.")).toBeInTheDocument();
  });

  it("generates a source-grounded exam review from the material's saved source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Lecture Exam Review",
            topics: [
              {
                topic: "Retrieval",
                keyIdeas: ["Retrieve context before generating."],
                formulaOrProcedure: "Retrieve, rank, generate.",
                commonConfusion: "Retrieval does not retrain the model.",
                sourceNote: "Page 1",
                relatedMistakeIds: [],
                mistakeFocus: "",
              },
              {
                topic: "Grounding",
                keyIdeas: ["Ground claims in supplied evidence."],
                formulaOrProcedure: "",
                commonConfusion: "Grounding is not a guarantee of truth.",
                sourceNote: "Page 2",
                relatedMistakeIds: [],
                mistakeFocus: "",
              },
              {
                topic: "Evaluation",
                keyIdeas: ["Compare claims with evidence."],
                formulaOrProcedure: "",
                commonConfusion: "Fluency is not correctness.",
                sourceNote: "Page 3",
                relatedMistakeIds: [],
                mistakeFocus: "",
              },
              {
                topic: "Failure modes",
                keyIdeas: ["Poor retrieval causes weak answers."],
                formulaOrProcedure: "Inspect retrieved evidence.",
                commonConfusion: "Failures can begin before generation.",
                sourceNote: "Page 4",
                relatedMistakeIds: [],
                mistakeFocus: "",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [],
          mistakes: [],
          sessions: [
            {
              id: "s1",
              title: "Lecture quiz",
              createdAt: "2026-07-30T10:00:00.000Z",
              questions: [],
              answers: {},
              grades: {},
              chat: {},
              source: {
                fileId: "file-lecture123",
                fileIds: ["file-lecture123"],
                transcript: "",
                materialId: "m1",
                materialName: "Lecture.pdf",
              },
            },
          ],
          lastPracticedAt: "2026-07-30T10:00:00.000Z",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate knowledge-point review sheet" }));

    expect(await screen.findByText("Lecture Exam Review")).toBeInTheDocument();
    expect(screen.getByText("Retrieve context before generating.")).toBeInTheDocument();
  });

  it("sends this PDF's mistakes and renders the linked learning focus", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Lecture Review",
          topics: Array.from({ length: 4 }, (_, index) => ({
            topic: `Topic ${index + 1}`,
            keyIdeas: ["Use source evidence."],
            formulaOrProcedure: "",
            commonConfusion: "Do not confuse evidence with training.",
            sourceNote: `Page ${index + 1}`,
            relatedMistakeIds: index === 0 ? ["mistake-1"] : [],
            mistakeFocus: index === 0 ? "Retrieve before generating." : "",
          })),
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [],
          mistakes: [
            {
              version: 1,
              id: "mistake-1",
              question: {
                id: "q1",
                type: "fill_blank",
                prompt: "Retrieval happens before ___.",
                acceptedAnswers: ["generation"],
                referenceAnswer: "generation",
                explanation: "Retrieve source context first.",
                sourceNote: "Page 1",
              },
              answer: "training",
              status: "incorrect",
              score: 0,
              feedback: "Review the retrieval sequence.",
              missingPoints: [],
              updatedAt: "2026-08-05T10:00:00.000Z",
              source: {
                fileId: "file-lecture123",
                transcript: "",
                materialId: "m1",
                materialName: "Lecture.pdf",
              },
            },
          ],
          sessions: [
            {
              id: "s1",
              title: "Lecture quiz",
              createdAt: "2026-08-05T10:00:00.000Z",
              questions: [],
              answers: {},
              grades: {},
              chat: {},
              source: {
                fileId: "file-lecture123",
                transcript: "",
                materialId: "m1",
                materialName: "Lecture.pdf",
              },
            },
          ],
          lastPracticedAt: "2026-08-05T10:00:00.000Z",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate knowledge-point review sheet" }));

    await screen.findByText("Lecture Review");
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(JSON.parse(String(form.get("mistakes")))).toEqual([
      expect.objectContaining({ id: "mistake-1", answer: "training", referenceAnswer: "generation" }),
    ]);
    expect(screen.queryByText("Your missed question")).not.toBeInTheDocument();
    expect(screen.getByText("Retrieve before generating.")).toBeInTheDocument();
    expect(screen.queryByText("Review the retrieval sequence.")).not.toBeInTheDocument();
  });

  it("creates a seven-day share link for the generated review", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Lecture Review",
          topics: Array.from({ length: 4 }, (_, index) => ({
            topic: `Topic ${index + 1}`,
            keyIdeas: ["Use source evidence."],
            formulaOrProcedure: "",
            commonConfusion: "Do not confuse evidence with training.",
            sourceNote: `Page ${index + 1}`,
            relatedMistakeIds: [],
            mistakeFocus: "",
          })),
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    getSupabaseBrowserClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: { slug: "review-123" }, error: null }),
    });
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [],
          mistakes: [],
          sessions: [
            {
              id: "s1",
              title: "Lecture quiz",
              createdAt: "2026-08-05T10:00:00.000Z",
              questions: [],
              answers: {},
              grades: {},
              chat: {},
              source: {
                fileId: "file-lecture123",
                transcript: "",
                materialId: "m1",
                materialName: "Lecture.pdf",
              },
            },
          ],
          lastPracticedAt: "2026-08-05T10:00:00.000Z",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate knowledge-point review sheet" }));
    await screen.findByText("Lecture Review");
    fireEvent.click(screen.getByRole("button", { name: "Share review link" }));

    expect(await screen.findByLabelText("Review share link")).toHaveValue(
      "http://localhost:3000/review/review-123",
    );
    expect(screen.getByText("Expires in 7 days")).toBeInTheDocument();
  });
});
