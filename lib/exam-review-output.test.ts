import { describe, expect, it } from "vitest";
import { parseExamReviewOutput } from "./exam-review-output";

const topic = {
  topic: "Customer segments",
  keyIdeas: ["Define the primary user group."],
  formulaOrProcedure: "",
  commonConfusion: "Do not confuse users with distribution channels.",
  sourceNote: "Page 1",
  relatedMistakeIds: [],
  mistakeFocus: "",
};

describe("parseExamReviewOutput", () => {
  it("unwraps a structured review envelope returned by a model gateway", () => {
    const payload = {
      exam_review: {
        title: "Business Model Review",
        topics: [topic, { ...topic, topic: "Value propositions" }, { ...topic, topic: "Channels" }, { ...topic, topic: "Revenue" }],
      },
    };

    expect(parseExamReviewOutput(JSON.stringify(payload))).toEqual(payload.exam_review);
  });

  it("strips a JSON code fence before parsing", () => {
    const payload = {
      title: "Business Model Review",
      topics: [topic, { ...topic, topic: "Value propositions" }, { ...topic, topic: "Channels" }, { ...topic, topic: "Revenue" }],
    };

    expect(parseExamReviewOutput(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)).toEqual(payload);
  });

  it("normalizes snake-case topic fields returned by a gateway", () => {
    const payload = {
      title: "Business Model Review",
      topics: ["Customer segments", "Value propositions", "Channels", "Revenue", "Costs"].map(
        (name) => ({
          name,
          key_points: `Understand ${name}.`,
          common_confusion: `Do not confuse ${name}.`,
          source: "Page 1",
        }),
      ),
    };

    expect(parseExamReviewOutput(JSON.stringify(payload)).topics[0]).toMatchObject({
      topic: "Customer segments",
      keyIdeas: ["Understand Customer segments."],
      formulaOrProcedure: "",
      commonConfusion: "Do not confuse Customer segments.",
      sourceNote: "Page 1",
      relatedMistakeIds: [],
      mistakeFocus: "",
    });
  });
});
