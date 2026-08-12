import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuestionReport } from "./question-report";
import { QUESTION_REPORTS_KEY, readReportedQuestions } from "@/lib/question-report";
import { GENERATION_LEARNINGS_KEY, readLearnings } from "@/lib/generation-learnings";
import { questionKey, type Question } from "@/lib/quiz";
import type { PersistedSource } from "@/lib/study-history";

const source: PersistedSource = {
  fileId: "file-abc123",
  fileIds: [],
  transcript: "",
  materialId: "lecture.pdf",
  materialName: "lecture.pdf",
};

const choice: Question = {
  id: "q1",
  type: "multiple_choice",
  prompt: "Which slide states the core test?",
  explanation: "Slide 4.",
  sourceNote: "Slide 4",
  correctOptionId: "b",
  options: [
    { id: "a", text: "Slide 1" },
    { id: "b", text: "Slide 4" },
    { id: "c", text: "Slide 7" },
    { id: "d", text: "Slide 9" },
  ],
};

const written: Question = {
  id: "q2",
  type: "short_answer",
  prompt: "Explain the core test.",
  explanation: "Repeat use and willingness to pay.",
  sourceNote: "Slide 4",
  referenceAnswer: "Repeat use and willingness to pay.",
  gradingCriteria: ["Names repeat use"],
  customLabel: null,
};

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(response: Partial<Response> & { json: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("sends the reason and note, then remembers the question as reported", async () => {
  const fetchMock = stubFetch({ json: () => Promise.resolve({ ok: true, stored: "database" }) });

  render(
    <QuestionReport question={choice} quizTitle="Validation quiz" materialName="lecture.pdf" />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  fireEvent.click(screen.getByRole("radio", { name: "The marked answer is wrong" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Slide 4 says the opposite." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Thank you"));

  const form = fetchMock.mock.calls[0][1].body as FormData;
  expect(fetchMock.mock.calls[0][0]).toBe("/api/report-question");
  expect(form.get("reason")).toBe("wrong_answer");
  expect(form.get("note")).toBe("Slide 4 says the opposite.");
  expect(form.get("questionKey")).toBe(questionKey(choice));
  expect(form.get("materialName")).toBe("lecture.pdf");
  // The source file is the learner's; only the question travels.
  expect(form.get("transcript")).toBeNull();
  expect(readReportedQuestions(window.localStorage.getItem(QUESTION_REPORTS_KEY))).toHaveLength(1);
});

it("will not send until the learner says what is wrong", async () => {
  const fetchMock = stubFetch({ json: () => Promise.resolve({ ok: true }) });

  render(<QuestionReport question={choice} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));

  expect(await screen.findByText("Choose what is wrong before sending.")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("offers the broken-options reason only on a multiple-choice question", () => {
  const { unmount } = render(<QuestionReport question={choice} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  expect(
    screen.getByRole("radio", { name: "The options are broken — none or several are right" }),
  ).toBeInTheDocument();
  unmount();

  render(<QuestionReport question={written} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  expect(
    screen.queryByRole("radio", { name: "The options are broken — none or several are right" }),
  ).not.toBeInTheDocument();
});

it("points at the feedback form when the report cannot be sent", async () => {
  stubFetch({ ok: false, json: () => Promise.resolve({ error: "The report could not be sent." }) });

  render(<QuestionReport question={choice} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  fireEvent.click(screen.getByRole("radio", { name: "It is not in my study material" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));

  expect(
    await screen.findByRole("link", { name: "Use the feedback form instead" }),
  ).toBeInTheDocument();
  // Nothing was recorded locally, so the learner can try again.
  expect(readReportedQuestions(window.localStorage.getItem(QUESTION_REPORTS_KEY))).toEqual([]);
});

it("shows what the check found in the material, not just an acknowledgement", async () => {
  stubFetch({
    json: () =>
      Promise.resolve({
        ok: true,
        stored: "database",
        verdict: {
          verdict: "confirmed",
          severity: "critical",
          finding: "Slide 9 states the core test, so the marked answer is wrong.",
          correctedAnswer: "Slide 9",
          rule: "verify_answer_key",
          scope: "core test slide",
        },
      }),
  });

  render(<QuestionReport question={choice} materialName="lecture.pdf" source={source} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  fireEvent.click(screen.getByRole("radio", { name: "The marked answer is wrong" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));

  expect(await screen.findByText(/Slide 9 states the core test/)).toBeInTheDocument();
  expect(screen.getByText(/you are right/i)).toBeInTheDocument();
  expect(screen.getByText("Slide 9")).toBeInTheDocument();
});

it("turns a confirmed serious fault into a lesson for this material's next quiz", async () => {
  stubFetch({
    json: () =>
      Promise.resolve({
        ok: true,
        verdict: {
          verdict: "confirmed",
          severity: "critical",
          finding: "The material never mentions this.",
          correctedAnswer: null,
          rule: "stay_in_source",
          scope: "core test slide",
        },
      }),
  });

  render(<QuestionReport question={choice} materialName="lecture.pdf" source={source} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  fireEvent.click(screen.getByRole("radio", { name: "It is not in my study material" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));

  await waitFor(() =>
    expect(readLearnings(window.localStorage.getItem(GENERATION_LEARNINGS_KEY))).toEqual([
      expect.objectContaining({
        rule: "stay_in_source",
        scope: "core test slide",
        materialName: "lecture.pdf",
        questionKey: questionKey(choice),
      }),
    ]),
  );
});

it("learns nothing from a question the material turned out to support", async () => {
  stubFetch({
    json: () =>
      Promise.resolve({
        ok: true,
        verdict: {
          verdict: "stands",
          severity: "minor",
          finding: "Slide 4 does say this; the option you picked is a near miss.",
          correctedAnswer: null,
          rule: null,
          scope: null,
        },
      }),
  });

  render(<QuestionReport question={choice} materialName="lecture.pdf" source={source} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  fireEvent.click(screen.getByRole("radio", { name: "The marked answer is wrong" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));

  expect(await screen.findByText(/the question holds up/i)).toBeInTheDocument();
  expect(readLearnings(window.localStorage.getItem(GENERATION_LEARNINGS_KEY))).toEqual([]);
});

it("sends the material reference so the complaint can be checked, never the file itself", async () => {
  const fetchMock = stubFetch({ json: () => Promise.resolve({ ok: true, verdict: null }) });

  render(<QuestionReport question={choice} source={source} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem with this question" }));
  fireEvent.click(screen.getByRole("radio", { name: "The marked answer is wrong" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const form = fetchMock.mock.calls[0][1].body as FormData;
  expect(form.get("fileId")).toBe("file-abc123");
  expect(JSON.parse(String(form.get("question")))).toMatchObject({ prompt: choice.prompt });
});

it("says so instead of asking twice for a question already reported", () => {
  window.localStorage.setItem(
    QUESTION_REPORTS_KEY,
    JSON.stringify([
      { key: questionKey(choice), reason: "unclear", reportedAt: new Date().toISOString() },
    ]),
  );

  render(<QuestionReport question={choice} />);

  expect(screen.getByRole("status")).toHaveTextContent("You have reported this question.");
  expect(
    screen.queryByRole("button", { name: "Report a problem with this question" }),
  ).not.toBeInTheDocument();
});
