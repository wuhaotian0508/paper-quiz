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
    "Give every multiple-choice option its own explanation: say why the correct option is correct, and for each distractor name the specific misconception or misread that makes it wrong. Never leave an option's explanation blank and never reuse the same sentence across options.",
    "Explain the answer and use sourceNote for the relevant page, section, or transcript topic.",
    // The export renders a printed exam paper, so the model supplies the banner and marks.
    "The quiz is printed as a formal exam paper. Fill in examHeader with courseTitle (the subject the material teaches), paperLabel (which paper this is, for example a mock final), durationMinutes (a realistic sitting time), and scope (the chapters or topics covered).",
    "Give each question a points value that reflects its weight: roughly 3 for multiple choice, 4 for fill-blank, and 10 to 20 for written questions. Keep points equal within a question type so the paper can print one marks rule per section.",
    "Before writing questions, identify distinct major topics across the material and distribute questions across them as evenly as the requested count allows. Do not repeat a question, answer target, or source fact; each question must assess a distinct concept or relationship.",
    "Do not invent facts that are not in the provided study material.",
    `Write every user-visible field in ${language}, including title, summary, examHeader, prompt, option text, per-option explanation, explanation, and sourceNote, even if the study material is in another language.`,
    "Return JSON only, without a Markdown code fence. The top-level value must be an object containing title, summary, examHeader, and questions.",
    "Every item needs id, type, prompt, points, explanation, sourceNote, and customLabel. Use customLabel only for custom questions; set it to null for every other type. Include the remaining fields appropriate for that type.",
    // The prose instruction above is not enough on its own: the model follows this field
    // contract, so an option shape that omits `explanation` gets quizzes with no per-option
    // analysis, and the nullish schema accepts them silently. Naming correctOptionId in the
    // same breath is deliberate — describing only the option shape here once cost every
    // question its correctOptionId, which fails the whole quiz.
    'A multiple-choice question needs both correctOptionId and an options array. correctOptionId is "a", "b", "c", or "d". Each option is {"id": "a", "text": "...", "explanation": "..."}, and all four need their own explanation.',
  ].join("\n");
}
