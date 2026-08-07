import { describe, expect, it } from "vitest";
import { buildExamPaper, questionPoints } from "./exam-paper";
import type { Quiz } from "./quiz";

function multipleChoice(id: string, points?: number): Quiz["questions"][number] {
  return {
    id,
    type: "multiple_choice",
    ...(points === undefined ? {} : { points }),
    prompt: `Question ${id}?`,
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
    correctOptionId: "a",
    explanation: "Because.",
    sourceNote: "Page 1",
  };
}

function written(id: string, points?: number): Quiz["questions"][number] {
  return {
    id,
    type: "short_answer",
    ...(points === undefined ? {} : { points }),
    prompt: `Explain ${id}.`,
    referenceAnswer: "An answer.",
    gradingCriteria: ["Mentions the idea"],
    customLabel: null,
    explanation: "Because.",
    sourceNote: "Page 2",
  };
}

const quiz = (questions: Quiz["questions"]): Quiz => ({
  title: "Practice set",
  summary: "A summary.",
  questions,
});

describe("buildExamPaper", () => {
  it("groups questions into sections and totals the marks", () => {
    const paper = buildExamPaper(
      quiz([multipleChoice("a", 3), multipleChoice("b", 3), written("c", 14)]),
      "en",
    );

    expect(paper.sections.map((section) => section.kind)).toEqual(["multiple_choice", "written"]);
    expect(paper.sections[0].points).toBe(6);
    expect(paper.totalPoints).toBe(20);
    expect(paper.sections[0].heading).toBe(
      "Part I — Multiple Choice (3 marks each, 6 marks total)",
    );
  });

  it("numbers questions continuously across sections in printed order", () => {
    const paper = buildExamPaper(quiz([written("a"), multipleChoice("b"), written("c")]), "en");

    expect(paper.sections[0].questions.map((item) => item.number)).toEqual([1]);
    expect(paper.sections[1].questions.map((item) => item.number)).toEqual([2, 3]);
  });

  it("prints marks on each question when a section mixes values", () => {
    const paper = buildExamPaper(quiz([written("a", 10), written("b", 20)]), "en");

    expect(paper.sections[0].showsPerQuestionPoints).toBe(true);
    expect(paper.sections[0].heading).toContain("marks are shown on each question");
  });

  it("falls back to a default mark for quizzes saved before marks existed", () => {
    expect(questionPoints(multipleChoice("a"))).toBe(3);
    expect(questionPoints(written("b"))).toBe(10);
  });

  it("uses Chinese ordinals and punctuation for a Chinese paper", () => {
    const paper = buildExamPaper(quiz([multipleChoice("a", 3), written("b", 14)]), "zh");

    expect(paper.sections[0].heading).toBe("一、选择题（每题3分，共3分）");
    expect(paper.sections[1].heading).toBe("二、解答题（每题14分，共14分）");
    expect(paper.scoreTable.columns).toEqual(["题号", "一", "二", "总分"]);
    expect(paper.identityFields).toEqual(["姓名", "学号", "班级"]);
  });

  it("builds the banner from the model's exam header", () => {
    const paper = buildExamPaper(
      {
        ...quiz([multipleChoice("a", 3)]),
        examHeader: {
          courseTitle: "《AI2803-计算机体系结构》",
          paperLabel: "期末模拟卷 A",
          durationMinutes: 120,
          scope: "1-20章",
        },
      },
      "zh",
    );

    // A Chinese title already closes with a bracket, so no separator is inserted.
    expect(paper.courseTitle).toBe("《AI2803-计算机体系结构》期末模拟卷 A");
    expect(paper.metaLine).toBe("考试时间：120分钟    满分：3分    范围：1-20章");
  });

  it("falls back to the quiz title and a derived duration without an exam header", () => {
    const paper = buildExamPaper(quiz([multipleChoice("a", 3), written("b", 14)]), "en");

    expect(paper.courseTitle).toBe("Practice set");
    expect(paper.metaLine).toContain("Time: 30 minutes");
    expect(paper.metaLine).toContain("Scope: A summary.");
  });
});
