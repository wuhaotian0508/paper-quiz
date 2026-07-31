import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HelpCenter } from "./help-center";

it("filters articles and sends empty searches to feedback", () => {
  render(<HelpCenter onBack={() => undefined} />);

  fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), {
    target: { value: "PDF" },
  });
  expect(screen.getByRole("heading", { name: "Export a PDF" })).toBeInTheDocument();

  fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), {
    target: { value: "unicorn controls" },
  });
  expect(screen.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
    "href",
    expect.stringContaining("Help%20search%3A%20unicorn%20controls"),
  );
});
