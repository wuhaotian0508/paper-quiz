import { describe, expect, it } from "vitest";
import {
  compareSubjects,
  groupBySubject,
  inferSubject,
  normaliseSubject,
  UNASSIGNED_SUBJECT,
} from "./subject";

describe("subject inference", () => {
  it("reads a course code out of a lecture file name", () => {
    expect(inferSubject("UGBA 117 AI Project - PaperQuiz AI.pdf")).toBe("UGBA 117");
    expect(inferSubject("CS61A Lecture 3.pdf")).toBe("CS 61A");
    expect(inferSubject("econ_101_week2.pdf")).toBe("ECON 101");
  });

  it("does not mistake a chapter or week number for a course", () => {
    expect(inferSubject("Week 3 Notes.pdf")).toBe(UNASSIGNED_SUBJECT);
    expect(inferSubject("Chapter 12 summary.pdf")).toBe(UNASSIGNED_SUBJECT);
    expect(inferSubject("Lecture 5.pdf")).toBe(UNASSIGNED_SUBJECT);
    expect(inferSubject("midterm 2 review.pdf")).toBe(UNASSIGNED_SUBJECT);
  });

  it("skips a leading section word and still finds the real code", () => {
    expect(inferSubject("Week 3 - UGBA 117 slides.pdf")).toBe("UGBA 117");
  });

  it("leaves a material unassigned when nothing looks like a course code", () => {
    expect(inferSubject("微观经济学 第三章.pdf")).toBe(UNASSIGNED_SUBJECT);
    expect(inferSubject("scan.pdf")).toBe(UNASSIGNED_SUBJECT);
  });

  it("collapses spacing so the same course written two ways matches", () => {
    expect(normaliseSubject("  UGBA   117 ")).toBe("UGBA 117");
    expect(inferSubject("ugba117-notes.pdf")).toBe(inferSubject("UGBA 117 notes.pdf"));
  });

  it("sorts unassigned materials below every named subject", () => {
    const sorted = ["MATH 1A", UNASSIGNED_SUBJECT, "CS 61A"].sort(compareSubjects);

    expect(sorted).toEqual(["CS 61A", "MATH 1A", UNASSIGNED_SUBJECT]);
  });

  it("groups items by subject in display order", () => {
    const materials = [
      { name: "b", subject: "MATH 1A" },
      { name: "c", subject: UNASSIGNED_SUBJECT },
      { name: "a", subject: "CS 61A" },
      { name: "d", subject: "MATH 1A" },
    ];

    expect(groupBySubject(materials, (item) => item.subject)).toEqual([
      { subject: "CS 61A", items: [materials[2]] },
      { subject: "MATH 1A", items: [materials[0], materials[3]] },
      { subject: UNASSIGNED_SUBJECT, items: [materials[1]] },
    ]);
  });
});
