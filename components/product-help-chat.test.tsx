import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProductHelpChat } from "./product-help-chat";

it("opens the API-backed product-help conversation from Help", () => {
  render(<ProductHelpChat />);
  fireEvent.click(screen.getByRole("button", { name: "Chatbot" }));
  expect(screen.getByLabelText("Product help chat")).toBeInTheDocument();
  expect(screen.getByLabelText("Ask how to use PaperQuiz")).toBeInTheDocument();
});
