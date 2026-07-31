import type { Question, Quiz } from "@/lib/quiz";

export type SharedPublicQuestion =
  | {
      id: string;
      type: "multiple_choice";
      prompt: string;
      options: { id: "a" | "b" | "c" | "d"; text: string }[];
    }
  | { id: string; type: "fill_blank"; prompt: string }
  | {
      id: string;
      type: "short_answer" | "custom";
      prompt: string;
      customLabel: string | null;
    };

export type SharedPublicQuiz = {
  title: string;
  summary: string;
  questions: SharedPublicQuestion[];
};

export type SharedAnswerKeyQuestion =
  | {
      id: string;
      type: "multiple_choice";
      correctOptionId: "a" | "b" | "c" | "d";
      explanation: string;
    }
  | {
      id: string;
      type: "fill_blank";
      acceptedAnswers: string[];
      referenceAnswer: string;
      explanation: string;
    }
  | {
      id: string;
      type: "short_answer" | "custom";
      referenceAnswer: string;
      explanation: string;
    };

export type SharedChallengeAnswerKey = { questions: SharedAnswerKeyQuestion[] };

export function buildSharedChallenge(quiz: Quiz): {
  publicQuiz: SharedPublicQuiz;
  answerKey: SharedChallengeAnswerKey;
} {
  return {
    publicQuiz: {
      title: quiz.title,
      summary: quiz.summary,
      questions: quiz.questions.map(toPublicQuestion),
    },
    answerKey: { questions: quiz.questions.map(toAnswerKeyQuestion) },
  };
}

export function getChallengeShareUrl(origin: string, slug: string) {
  return new URL(`/challenge/${encodeURIComponent(slug)}`, origin).toString();
}

function toPublicQuestion(question: Question): SharedPublicQuestion {
  if (question.type === "multiple_choice") {
    return {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
    };
  }
  if (question.type === "fill_blank") {
    return { id: question.id, type: question.type, prompt: question.prompt };
  }
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    customLabel: question.customLabel,
  };
}

function toAnswerKeyQuestion(question: Question): SharedAnswerKeyQuestion {
  if (question.type === "multiple_choice") {
    return {
      id: question.id,
      type: question.type,
      correctOptionId: question.correctOptionId,
      explanation: question.explanation,
    };
  }
  if (question.type === "fill_blank") {
    return {
      id: question.id,
      type: question.type,
      acceptedAnswers: question.acceptedAnswers,
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
    };
  }
  return {
    id: question.id,
    type: question.type,
    referenceAnswer: question.referenceAnswer,
    explanation: question.explanation,
  };
}
