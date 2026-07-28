import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("provides a pre-addressed feedback email link", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "#progress");
    const feedback = screen.getByRole("link", { name: "Feedback" });
    expect(feedback).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:haotianwu123%40berkeley.edu"),
    );
  });
});
