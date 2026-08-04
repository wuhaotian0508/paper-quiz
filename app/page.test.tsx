import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseServerClient, redirect } = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect }));
import Home from "./page";

async function renderHome(authError?: string) {
  render(await Home({ searchParams: Promise.resolve({ authError }) }));
}

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "student-1" } } }) },
    });
  });

  it("redirects a visitor without a session to the dedicated login route", async () => {
    getSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });

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
