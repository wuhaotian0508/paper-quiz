import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductHelpConversation } from "./product-help-conversation";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("sends only product-help fields to the dedicated API and renders guidance", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ reply: "1. Click Mistake Book.", needsFeedback: false }), {
      status: 200,
    }),
  );
  render(<ProductHelpConversation />);

  fireEvent.change(screen.getByLabelText("Ask how to use PaperQuiz"), {
    target: { value: "Where are my mistakes?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send help question" }));

  expect(await screen.findByText("1. Click Mistake Book.")).toBeInTheDocument();
  expect(fetchSpy).toHaveBeenCalledWith(
    "/api/product-help",
    expect.objectContaining({ method: "POST" }),
  );
  expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
    message: "Where are my mistakes?",
    history: [],
    currentView: "dashboard",
    locale: "en",
  });
});

it("shows Feedback when the API marks a request unsupported", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ reply: "I can only help with PaperQuiz.", needsFeedback: true })),
  );
  render(<ProductHelpConversation />);

  fireEvent.click(screen.getByRole("button", { name: "How do I export a PDF?" }));

  expect(await screen.findByRole("link", { name: "Send feedback" })).toBeInTheDocument();
});

it("keeps the question and shows a retryable error after an API failure", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network unavailable"));
  render(<ProductHelpConversation />);

  fireEvent.click(screen.getByRole("button", { name: "How do I upload study material?" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
  expect(
    screen.getByText("How do I upload study material?", { selector: ".product-help-message.user" }),
  ).toBeInTheDocument();
});

it("shows the server error returned by the chatbot API", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "The help service is not configured." }), { status: 503 }),
  );
  render(<ProductHelpConversation />);

  fireEvent.click(screen.getByRole("button", { name: "How do I upload study material?" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("The help service is not configured.");
});
