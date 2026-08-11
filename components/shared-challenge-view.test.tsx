import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharedChallengeView } from "./shared-challenge-view";
import type { SharedChallengeClient } from "@/lib/shared-challenge-client";

function createClient(attempt?: unknown): SharedChallengeClient {
  return {
    rpc: vi.fn().mockImplementation((name: string) => {
      if (name === "get_shared_challenge") {
        return Promise.resolve({
          data: {
            slug: "share-123",
            title: "Probability challenge",
            summary: "Test your foundations.",
            quiz: {
              questions: [
                {
                  id: "q1",
                  type: "multiple_choice",
                  prompt: "Choose B.",
                  options: [
                    { id: "a", text: "A" },
                    { id: "b", text: "B" },
                    { id: "c", text: "C" },
                    { id: "d", text: "D" },
                  ],
                },
              ],
            },
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: attempt ?? {
          score: 1,
          objectiveCount: 1,
          results: [{ id: "q1", status: "correct", score: 1, feedback: "B is right." }],
        },
        error: null,
      });
    }),
  };
}

afterEach(() => cleanup());

it("lets a visitor take a shared quiz without exposing the answer before submission", async () => {
  render(<SharedChallengeView slug="share-123" client={createClient()} />);

  expect(await screen.findByRole("heading", { name: "Probability challenge" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Use this quiz" })).toHaveAttribute(
    "href",
    "#shared-quiz",
  );
  expect(screen.queryByText("B is right.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "B" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit challenge" }));

  expect(await screen.findByText("B is right.")).toBeInTheDocument();
  expect(screen.getByText("Score: 100%")).toBeInTheDocument();
});

it("tells a signed-out taker which option was correct after a wrong answer", async () => {
  // The grader has always returned `correctOptionId`, but the results list only rendered
  // `referenceAnswer` — which multiple choice does not carry — so a wrong answer produced a
  // verdict and an explanation with the actual answer nowhere on the page.
  const client = createClient({
    score: 0,
    objectiveCount: 1,
    results: [
      { id: "q1", status: "incorrect", score: 0, correctOptionId: "b", feedback: "B is right." },
    ],
  });
  render(<SharedChallengeView slug="share-123" client={client} />);

  expect(await screen.findByRole("heading", { name: "Probability challenge" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "C" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit challenge" }));

  expect(await screen.findByText("Correct answer: B. B")).toBeInTheDocument();
  expect(screen.getByText("Your answer: C. C")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Choose B." })).toBeInTheDocument();
});

it("marks an unanswered question as blank rather than showing an empty answer", async () => {
  const client = createClient({
    score: 0,
    objectiveCount: 1,
    results: [
      { id: "q1", status: "incorrect", score: 0, correctOptionId: "b", feedback: "B is right." },
    ],
  });
  render(<SharedChallengeView slug="share-123" client={client} />);

  expect(await screen.findByRole("heading", { name: "Probability challenge" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Submit challenge" }));

  expect(await screen.findByText("Your answer: left blank")).toBeInTheDocument();
});
