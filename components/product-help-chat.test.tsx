import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductHelpChat } from "./product-help-chat";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("answers a suggested PDF question without fetch", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(<ProductHelpChat />);

  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  fireEvent.click(screen.getByRole("button", { name: "How do I export a PDF?" }));

  expect(screen.getByText(/Student copy \(no answers\)/i)).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("uses feedback for unsupported questions", () => {
  render(<ProductHelpChat />);

  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  fireEvent.change(screen.getByLabelText("Ask about using Paper Plane Quiz"), {
    target: { value: "Can you solve my homework?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send help question" }));

  expect(screen.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
    "href",
    expect.stringContaining("Chatbot%20question%3A%20Can%20you%20solve%20my%20homework%3F"),
  );
});
