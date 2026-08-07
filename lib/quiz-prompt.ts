import type { QuestionConfiguration } from "@/lib/quiz";
import { DEFAULT_LOCALE, generationLanguage, type Locale } from "@/lib/i18n";

export function buildQuizInstructions(settings: {
  questions: QuestionConfiguration[];
  difficulty: string;
  locale?: Locale;
}) {
  const language = generationLanguage(settings.locale ?? DEFAULT_LOCALE);
  const requestedTypes = settings.questions
    .map((item) => {
      if (item.type === "custom")
        return `${item.count} ${item.label} question(s): ${item.instructions}`;
      return `${item.count} ${item.type.replaceAll("_", " ")} question(s)`;
    })
    .join("; ");
  return [
    "You are a careful, clear exam tutor. Create questions based only on the provided study material.",
    `Generate exactly: ${requestedTypes}. Use ${settings.difficulty} difficulty.`,
    "Multiple-choice questions need exactly four options (a, b, c, d) and correctOptionId. Fill-blank questions need acceptedAnswers and referenceAnswer. Written and custom questions need referenceAnswer and gradingCriteria.",
    "Explain the answer and use sourceNote for the relevant page, section, or transcript topic.",
    "Before writing questions, identify distinct major topics across the material and distribute questions across them as evenly as the requested count allows. Do not repeat a question, answer target, or source fact; each question must assess a distinct concept or relationship.",
    "Do not invent facts that are not in the provided study material.",
    `Write every user-visible field in ${language}, including title, summary, prompt, option text, explanation, and sourceNote, even if the study material is in another language.`,
    "Return JSON only, without a Markdown code fence. The top-level value must be an object containing title, summary, and questions.",
    "Every item needs id, type, prompt, explanation, sourceNote, and customLabel. Use customLabel only for custom questions; set it to null for every other type. Include the remaining fields appropriate for that type.",
  ].join("\n");
}
