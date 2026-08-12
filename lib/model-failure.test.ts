import { describe, expect, it } from "vitest";
import { describeModelFailure, readFailureText } from "./model-failure";

describe("readFailureText", () => {
  it("reads a bare string, which is what a streamed failure detail arrives as", () => {
    expect(readFailureText("context_length_exceeded: too long")).toBe(
      "context_length_exceeded: too long",
    );
  });

  it("joins an SDK error's code and message", () => {
    expect(readFailureText({ code: "rate_limit_exceeded", message: "Slow down." })).toBe(
      "rate_limit_exceeded: Slow down.",
    );
  });

  it("reaches the provider body one level inside the thrown error", () => {
    expect(readFailureText(new Error("Request failed"))).toBe("Request failed");
    expect(
      readFailureText({ message: "400 Bad Request", error: { message: "too many pages" } }),
    ).toBe("400 Bad Request: too many pages");
  });

  it("returns an empty string for a value carrying nothing readable", () => {
    expect(readFailureText(null)).toBe("");
    expect(readFailureText(undefined)).toBe("");
    expect(readFailureText(42)).toBe("");
    expect(readFailureText({})).toBe("");
  });
});

describe("describeModelFailure", () => {
  it("turns a context overflow into the action that fixes it", () => {
    // The learner uploaded more than fits; "try again later" would never come true.
    expect(describeModelFailure("context_length_exceeded")).toMatch(
      /too large to handle in one go/,
    );
    expect(
      describeModelFailure({ message: "This model's maximum context length is 400000 tokens" }),
    ).toMatch(/fewer PDFs/);
    expect(describeModelFailure("The input is too long for this model.")).toMatch(/one chapter/);
  });

  it("names the page limit separately, because splitting one PDF is the fix", () => {
    expect(describeModelFailure("file exceeds the maximum of 100 pages")).toMatch(/more pages/);
    expect(describeModelFailure({ message: "Too many pages in document" })).toMatch(/Split it/);
  });

  it("distinguishes an oversized upload from an oversized context", () => {
    expect(describeModelFailure("413 Request Entity Too Large")).toMatch(/too large to send/);
    expect(describeModelFailure({ code: "file_too_large" })).toMatch(/smaller files/);
  });

  it("tells the learner to wait when the provider is the one that is busy", () => {
    expect(describeModelFailure("rate_limit_exceeded")).toMatch(/busy right now/);
    expect(describeModelFailure({ message: "The engine is currently overloaded" })).toMatch(
      /Wait a moment/,
    );
  });

  it("recognises a refusal whether it arrives as a code or as prose", () => {
    // The machine code and the sentence describe one refusal, and a learner hitting it
    // through a gateway that paraphrases deserves the same advice as one hitting it direct.
    for (const text of ["file_too_large", "The file is too large", "413 Payload Too Large"])
      expect(describeModelFailure(text)).toMatch(/too large to send/);
    for (const text of ["context_length_exceeded", "maximum context length reached"])
      expect(describeModelFailure(text)).toMatch(/too large to handle in one go/);
  });

  it("does not read a digit run inside a token count as a status code", () => {
    expect(describeModelFailure("resolved 41300 tokens against the budget")).toBeNull();
  });

  it("stays silent on anything it does not recognise, so internals cannot leak", () => {
    // The caller's generic sentence has to stand rather than a provider's stack trace
    // reaching a learner because it happened to arrive in a new shape.
    expect(describeModelFailure("upstream connection reset by peer at 10.0.3.4:8443")).toBeNull();
    expect(describeModelFailure("invalid_api_key: incorrect key sk-proj-abc123")).toBeNull();
    expect(describeModelFailure("")).toBeNull();
    expect(describeModelFailure(null)).toBeNull();
  });
});
