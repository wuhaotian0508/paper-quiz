import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SharedChallengeView } from "./shared-challenge-view";
import type { SharedChallengeClient } from "@/lib/shared-challenge-client";

function createClient(): SharedChallengeClient {
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
        data: {
          score: 1,
          objectiveCount: 1,
          results: [{ id: "q1", status: "correct", score: 1, feedback: "B is right." }],
        },
        error: null,
      });
    }),
  };
}

it("lets a visitor take a shared quiz without exposing the answer before submission", async () => {
  render(<SharedChallengeView slug="share-123" client={createClient()} />);

  expect(await screen.findByRole("heading", { name: "Probability challenge" })).toBeInTheDocument();
  expect(screen.queryByText("B is right.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "B" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit challenge" }));

  expect(await screen.findByText("B is right.")).toBeInTheDocument();
  expect(screen.getByText("Score: 100%")).toBeInTheDocument();
});
