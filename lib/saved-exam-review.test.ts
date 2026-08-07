import { describe, expect, it } from "vitest";
import { getSavedExamReview, readSavedExamReviews, saveExamReview } from "./saved-exam-review";

const review = {
  title: "GraphRAG Review",
  topics: ["Retrieval", "Indexing", "Generation", "Evaluation"].map((topic) => ({
    topic,
    keyIdeas: [`Review ${topic}.`],
    formulaOrProcedure: "",
    commonConfusion: `Do not confuse ${topic}.`,
    sourceNote: "Page 1",
    relatedMistakeIds: [],
    mistakeFocus: "",
  })),
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) || null,
    key: (index) => [...values.keys()][index] || null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("saved exam reviews", () => {
  it("saves the latest review per PDF and restores it after a page refresh", () => {
    const storage = memoryStorage();
    const saved = saveExamReview("material-1", review, storage);

    expect(saved).toMatchObject({ materialId: "material-1", review });
    expect(getSavedExamReview("material-1", storage)).toMatchObject({ review });
  });

  it("ignores malformed local review data", () => {
    expect(readSavedExamReviews("not-json")).toEqual([]);
    expect(readSavedExamReviews(JSON.stringify([{ materialId: "m" }]))).toEqual([]);
  });
});
