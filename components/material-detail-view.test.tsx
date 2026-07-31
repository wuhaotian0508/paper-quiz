import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialDetailView } from "./material-detail-view";

describe("MaterialDetailView", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  it("waits for the learner to generate a review sheet for this PDF", () => {
    render(
      <MaterialDetailView
        material={{
          id: "m1",
          name: "Lecture.pdf",
          questions: [],
          mistakes: [],
          sessions: [],
          lastPracticedAt: "",
        }}
        onBack={vi.fn()}
        onPractice={vi.fn()}
      />,
    );

    expect(screen.queryByText("Lecture.pdf Review Sheet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate review sheet" }));
    expect(screen.getByText("Lecture.pdf Review Sheet")).toBeInTheDocument();
    expect(screen.getByText("No saved questions for this material yet.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Generate review sheet" }));

    expect(screen.getByText("A durable advantage can come from ___.")).toBeInTheDocument();
    expect(screen.getByText("No saved questions for this material yet.")).toBeInTheDocument();
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
              },
              {
                topic: "Grounding",
                keyIdeas: ["Ground claims in supplied evidence."],
                formulaOrProcedure: "",
                commonConfusion: "Grounding is not a guarantee of truth.",
                sourceNote: "Page 2",
              },
              {
                topic: "Evaluation",
                keyIdeas: ["Compare claims with evidence."],
                formulaOrProcedure: "",
                commonConfusion: "Fluency is not correctness.",
                sourceNote: "Page 3",
              },
              {
                topic: "Failure modes",
                keyIdeas: ["Poor retrieval causes weak answers."],
                formulaOrProcedure: "Inspect retrieved evidence.",
                commonConfusion: "Failures can begin before generation.",
                sourceNote: "Page 4",
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

    fireEvent.click(screen.getByRole("button", { name: "Generate exam review" }));

    expect(await screen.findByText("Lecture Exam Review")).toBeInTheDocument();
    expect(screen.getByText("Retrieve context before generating.")).toBeInTheDocument();
  });
});
