import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import LoginPage from "./page";

it("keeps the public login route separate from the workspace", async () => {
  render(await LoginPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
});

it("passes callback errors to the login form", async () => {
  render(await LoginPage({ searchParams: Promise.resolve({ authError: "callback" }) }));

  expect(screen.getByRole("alert")).toHaveTextContent(/sign-in didn't finish/i);
});

