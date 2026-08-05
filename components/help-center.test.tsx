import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HelpCenter } from "./help-center";

it("shows the product-help chatbot from the Help navigation", () => {
  render(<HelpCenter onBack={() => undefined} />);
  expect(screen.getByRole("heading", { name: "How can PaperQuiz help?" })).toBeInTheDocument();
  expect(screen.getByLabelText("Ask how to use PaperQuiz")).toBeInTheDocument();
});
