import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

async function renderHome(authError?: string) {
  render(await Home({ searchParams: Promise.resolve({ authError }) }));
}

describe("Home", () => {
  it("provides a pre-addressed feedback email link", async () => {
    await renderHome();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "#dashboard");
    expect(screen.getByRole("link", { name: "Quiz Lab" })).toHaveAttribute("href", "#quiz-lab");
    expect(screen.getByRole("link", { name: "Mistake Book" })).toHaveAttribute(
      "href",
      "#mistake-book",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "#progress");
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "#history");
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "#help");
    const feedback = screen.getByRole("link", { name: "Feedback" });
    expect(feedback).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:haotianwu123@berkeley.edu"),
    );
    expect(screen.getByText("Sign-in unavailable").closest(".app-sidebar")).not.toBeNull();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("shows an actionable sign-in failure after an auth callback error", async () => {
    await renderHome("callback");

    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in didn't finish. Please try again.");
  });
});
