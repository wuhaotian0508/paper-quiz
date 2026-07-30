import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { FrontendPreview } from "./frontend-preview";

afterEach(cleanup);

it("starts on upload and switches the preview theme", () => {
  render(<FrontendPreview />);

  expect(screen.getByRole("heading", { name: "Upload your materials" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "AI generated for you" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));

  expect(screen.getByTestId("frontend-preview")).toHaveAttribute("data-theme", "dark");
  expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
});

it("reviews a selected PDF and returns to upload from the brand", () => {
  render(<FrontendPreview />);

  fireEvent.click(screen.getByRole("tab", { name: "Review and Explore" }));
  expect(screen.getByRole("heading", { name: "AI generated for you" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Review material"), {
    target: { value: "graphs" },
  });
  expect(screen.getByText("Reviewing: Lecture 11 - Graphs.pdf")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "PaperQuiz AI home" }));
  expect(screen.getByRole("heading", { name: "Upload your materials" })).toBeInTheDocument();
});
