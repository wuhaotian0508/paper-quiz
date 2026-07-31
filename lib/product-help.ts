export type HelpCategory =
  | "Getting started"
  | "Question setup"
  | "Answering"
  | "Review and exports"
  | "Privacy and feedback";

export type HelpArticle = {
  id: string;
  category: HelpCategory;
  title: string;
  summary: string;
  keywords: string[];
  body: string[];
};

export type ProductHelpReply =
  | { kind: "article"; article: HelpArticle; text: string }
  | { kind: "fallback"; text: string };

export const productHelpArticles: HelpArticle[] = [
  {
    id: "getting-started",
    category: "Getting started",
    title: "Create your first quiz",
    summary: "Upload a PDF or lecture recording, then generate practice.",
    keywords: ["upload", "pdf", "audio", "recording"],
    body: [
      "Choose a PDF or lecture recording on the home screen.",
      "Review a recording transcript before generating.",
    ],
  },
  {
    id: "question-setup",
    category: "Question setup",
    title: "Choose question types",
    summary: "Set counts for multiple choice, fill blank, short answer, or a custom type.",
    keywords: ["question", "type", "fill", "multiple", "custom"],
    body: [
      "Use Question mix to set a count for each format.",
      "A custom type needs a name and requirements.",
    ],
  },
  {
    id: "answering",
    category: "Answering",
    title: "Answer and review feedback",
    summary: "Submit once to see feedback and reference answers.",
    keywords: ["answer", "grade", "submit", "feedback"],
    body: [
      "Multiple choice is checked immediately.",
      "Written responses receive source-grounded feedback.",
    ],
  },
  {
    id: "mistake-book",
    category: "Review and exports",
    title: "Use the Mistake book",
    summary: "Review saved missed questions and practise selected ones.",
    keywords: ["mistake", "wrong", "review", "practice", "book"],
    body: [
      "Open Mistake book from the home screen or quiz toolbar.",
      "Mistakes are saved in this browser only.",
    ],
  },
  {
    id: "pdf-exports",
    category: "Review and exports",
    title: "Export a PDF",
    summary: "Download a student copy or answer key.",
    keywords: ["pdf", "download", "export", "student", "answer", "print"],
    body: [
      "Student copy (no answers) exports a printable paper.",
      "Answer key (with answers) includes answers and explanations.",
    ],
  },
  {
    id: "history-calendar",
    category: "Review and exports",
    title: "Find past practice",
    summary: "Use Progress and calendar to open a saved review.",
    keywords: ["history", "calendar", "progress", "past", "session"],
    body: ["Select a practice day.", "Open a session to view recorded answers and grades."],
  },
  {
    id: "privacy-feedback",
    category: "Privacy and feedback",
    title: "Privacy and feedback",
    summary: "Local study records stay in this browser; feedback reaches the owner.",
    keywords: ["privacy", "data", "feedback", "email"],
    body: [
      "Product Help does not use your uploaded study material.",
      "Use Feedback in the header to send a message.",
    ],
  },
];

const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export function findHelpArticles(query: string) {
  const queryWords = new Set(words(query));

  return productHelpArticles
    .map((article) => ({
      article,
      score: words(
        [article.title, article.summary, article.keywords.join(" "), article.body.join(" ")].join(
          " ",
        ),
      ).filter((word) => queryWords.has(word)).length,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.article);
}

export function getProductHelpReply(query: string): ProductHelpReply {
  const article = findHelpArticles(query)[0];
  if (article) {
    return { kind: "article", article, text: `${article.title}: ${article.body.join(" ")}` };
  }
  return {
    kind: "fallback",
    text: "I do not have a documented answer for that yet. Please use Feedback to tell us what you need.",
  };
}
