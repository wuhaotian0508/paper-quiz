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
        sourcePages: [{ pageNumber: 1, imageUrl: "data:image/jpeg;base64,preview" }],
      },
      error: null,
    }),
  };

  render(<SharedReviewView slug="review-123" client={client} />);

  expect(await screen.findByRole("heading", { name: "Lecture Review" })).toBeInTheDocument();
  expect(screen.getByText("Review the sequence.")).toBeInTheDocument();
  // Sign-in from a shared review goes to the dashboard, not back to this read-only page.
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "Use this review" })).toHaveAttribute(
    "href",
    "#review-topics",
  );
  expect(screen.getByRole("img", { name: "Source page 1" })).toHaveAttribute(
    "src",
    "data:image/jpeg;base64,preview",
  );
});
