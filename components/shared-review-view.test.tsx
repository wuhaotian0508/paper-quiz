import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SharedReviewView } from "./shared-review-view";
import type { SharedReviewClient } from "@/lib/shared-review-client";

it("renders a read-only review with sign-in and use actions", async () => {
  const client: SharedReviewClient = {
    rpc: vi.fn().mockResolvedValue({
      data: {
        slug: "review-123",
        title: "Lecture Review",
        topics: [
          {
            topic: "Retrieval",
            keyIdeas: ["Retrieve context first."],
            formulaOrProcedure: "",
            commonConfusion: "Retrieval is not training.",
            sourceNote: "Page 1",
            mistakeFocus: "Review the sequence.",
          },
        ],
      },
      error: null,
    }),
  };

  render(<SharedReviewView slug="review-123" client={client} />);

  expect(await screen.findByRole("heading", { name: "Lecture Review" })).toBeInTheDocument();
  expect(screen.getByText("Review the sequence.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Freview%2Freview-123",
  );
  expect(screen.getByRole("link", { name: "Use this review" })).toHaveAttribute(
    "href",
    "#review-topics",
  );
});
