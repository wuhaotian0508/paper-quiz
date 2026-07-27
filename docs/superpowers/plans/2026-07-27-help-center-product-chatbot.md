# Help Center and Product Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable English help center and an offline, session-only product-support chatbot that explains how to use Paper Plane Quiz without accessing learning material or the academic tutor.

**Architecture:** A typed `lib/product-help.ts` knowledge base is the single source for help-center content, search, suggested questions, and chatbot replies. `HelpCenter` renders articles in the existing workspace view state; `ProductHelpChat` is mounted by the page shell so its floating launcher works across study views. Matching and fallback run entirely in the browser.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, existing CSS custom properties.

---

## File Structure

- Create: `lib/product-help.ts` - typed articles, local matching, fallback response.
- Create: `lib/product-help.test.ts` - search and safety-boundary tests.
- Create: `components/help-center.tsx` - searchable long-form help UI.
- Create: `components/help-center.test.tsx` - article search and feedback-fallback tests.
- Create: `components/product-help-chat.tsx` - fixed, session-only support chat.
- Create: `components/product-help-chat.test.tsx` - local chat, fallback, and close tests.
- Modify: `components/quiz-workspace.tsx` - add the `help` view and `#help` routing.
- Modify: `components/quiz-workspace.test.tsx` - cover help hash routing.
- Modify: `app/page.tsx` and `app/page.test.tsx` - global Help entry point and widget mount.
- Modify: `app/globals.css` - responsive help page and widget styling.

### Task 1: Establish the local product-help contract

**Files:**
- Create: `lib/product-help.ts`
- Create: `lib/product-help.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { findHelpArticles, getProductHelpReply } from "@/lib/product-help";

describe("product help", () => {
  it("finds PDF export help", () => {
    expect(findHelpArticles("How do I download a PDF?")[0]?.id).toBe("pdf-exports");
  });
  it("answers documented use questions locally", () => {
    expect(getProductHelpReply("Where is my mistake book?").kind).toBe("article");
  });
  it("refuses to invent unsupported or academic answers", () => {
    expect(getProductHelpReply("Can you solve my calculus homework?").kind).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/product-help.test.ts`

Expected: FAIL because `lib/product-help.ts` does not exist.

- [ ] **Step 3: Implement the knowledge base and matching API**

```ts
export type HelpCategory = "Getting started" | "Question setup" | "Answering" | "Review and exports" | "Privacy and feedback";
export type HelpArticle = { id: string; category: HelpCategory; title: string; summary: string; keywords: string[]; body: string[] };
export type ProductHelpReply = { kind: "article"; article: HelpArticle; text: string } | { kind: "fallback"; text: string };

export const productHelpArticles: HelpArticle[] = [
  { id: "getting-started", category: "Getting started", title: "Create your first quiz", summary: "Upload a PDF or lecture recording, then generate practice.", keywords: ["upload", "pdf", "audio", "recording"], body: ["Choose a PDF or lecture recording on the home screen.", "Review a recording transcript before generating."] },
  { id: "question-setup", category: "Question setup", title: "Choose question types", summary: "Set counts for multiple choice, fill blank, short answer, or a custom type.", keywords: ["question", "type", "fill", "multiple", "custom"], body: ["Use Question mix to set a count for each format.", "A custom type needs a name and requirements."] },
  { id: "answering", category: "Answering", title: "Answer and review feedback", summary: "Submit once to see feedback and reference answers.", keywords: ["answer", "grade", "submit", "feedback"], body: ["Multiple choice is checked immediately.", "Written responses receive source-grounded feedback."] },
  { id: "mistake-book", category: "Review and exports", title: "Use the Mistake book", summary: "Review saved missed questions and practise selected ones.", keywords: ["mistake", "wrong", "review", "practice", "book"], body: ["Open Mistake book from the home screen or quiz toolbar.", "Mistakes are saved in this browser only."] },
  { id: "pdf-exports", category: "Review and exports", title: "Export a PDF", summary: "Download a student copy or answer key.", keywords: ["pdf", "download", "export", "student", "answer", "print"], body: ["Student copy (no answers) exports a printable paper.", "Answer key (with answers) includes answers and explanations."] },
  { id: "history-calendar", category: "Review and exports", title: "Find past practice", summary: "Use Progress and calendar to open a saved review.", keywords: ["history", "calendar", "progress", "past", "session"], body: ["Select a practice day.", "Open a session to view recorded answers and grades."] },
  { id: "privacy-feedback", category: "Privacy and feedback", title: "Privacy and feedback", summary: "Local study records stay in this browser; feedback reaches the owner.", keywords: ["privacy", "data", "feedback", "email"], body: ["Product Help does not use your uploaded study material.", "Use Feedback in the header to send a message."] },
];

const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
export function findHelpArticles(query: string) { const queryWords = new Set(words(query)); return productHelpArticles.map((article) => ({ article, score: words([article.title, article.summary, article.keywords.join(" "), article.body.join(" ")].join(" ")).filter((word) => queryWords.has(word)).length })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.article); }
export function getProductHelpReply(query: string): ProductHelpReply { const article = findHelpArticles(query)[0]; return article ? { kind: "article", article, text: `${article.title}: ${article.body.join(" ")}` } : { kind: "fallback", text: "I do not have a documented answer for that yet. Please use Feedback to tell us what you need." }; }
```

Include all seven approved English topics. Do not import quiz state, `File`, `fetch`, `localStorage`, `FormData`, or OpenAI.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- lib/product-help.test.ts`

Expected: PASS with three passing cases.

- [ ] **Step 5: Commit**

```powershell
git add lib/product-help.ts lib/product-help.test.ts
git commit -m "feat: add local product help knowledge base"
```

### Task 2: Build the searchable help center

**Files:**
- Create: `components/help-center.tsx`
- Create: `components/help-center.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing UI test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HelpCenter } from "./help-center";

it("filters articles and sends empty searches to feedback", () => {
  render(<HelpCenter onBack={() => undefined} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), { target: { value: "PDF" } });
  expect(screen.getByRole("heading", { name: "Export a PDF" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search help" }), { target: { value: "unicorn controls" } });
  expect(screen.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", expect.stringContaining("mailto:haotianwu123%40berkeley.edu"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/help-center.test.tsx`

Expected: FAIL because `HelpCenter` does not exist.

- [ ] **Step 3: Implement the page component**

```tsx
"use client";
import { useMemo, useState } from "react";
import { findHelpArticles, productHelpArticles } from "@/lib/product-help";

const feedbackHref = "mailto:haotianwu123%40berkeley.edu?subject=Paper%20Plane%20Quiz%20feedback";
export function HelpCenter({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const articles = useMemo(() => query.trim() ? findHelpArticles(query) : productHelpArticles, [query]);
  return <section className="help-page"><header className="help-heading"><div><div className="eyebrow">Help center</div><h1>Small steps, clear answers.</h1><p className="muted-copy">Find a feature, then get back to studying.</p></div><button className="text-button" onClick={onBack}>Back to quiz</button></header><label className="help-search">Search help<input type="search" aria-label="Search help" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try export PDF or mistake book" /></label>{articles.length ? <div className="help-article-list">{articles.map((article) => <article className="help-article" key={article.id}><span>{article.category}</span><h2>{article.title}</h2><p>{article.summary}</p><ol>{article.body.map((step) => <li key={step}>{step}</li>)}</ol></article>)}</div> : <div className="help-empty"><h2>No matching help article</h2><p>Tell us what you were trying to do.</p><a className="primary-button" href={feedbackHref}>Send feedback</a></div>}</section>;
}
```

Add `.help-page`, `.help-heading`, `.help-search`, `.help-article-list`, `.help-article`, and `.help-empty` styles. Keep the existing colorful paper palette and make the article list one column on narrow screens.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- components/help-center.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add components/help-center.tsx components/help-center.test.tsx app/globals.css
git commit -m "feat: add searchable help center"
```

### Task 3: Add the floating local product-support chat

**Files:**
- Create: `components/product-help-chat.tsx`
- Create: `components/product-help-chat.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing chat tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProductHelpChat } from "./product-help-chat";

it("answers a suggested PDF question without fetch", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(<ProductHelpChat />);
  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  fireEvent.click(screen.getByRole("button", { name: "How do I export a PDF?" }));
  expect(screen.getByText(/Student copy \(no answers\)/i)).toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("uses feedback for unsupported questions", () => {
  render(<ProductHelpChat />);
  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  fireEvent.change(screen.getByLabelText("Ask about using Paper Plane Quiz"), { target: { value: "Can you solve my homework?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send help question" }));
  expect(screen.getByRole("link", { name: "Send feedback" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/product-help-chat.test.tsx`

Expected: FAIL because `ProductHelpChat` does not exist.

- [ ] **Step 3: Implement local-only chat**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { getProductHelpReply } from "@/lib/product-help";

type Message = { role: "user" | "assistant"; text: string; fallback?: boolean };
const suggestions = ["How do I upload a lecture?", "How do I choose question types?", "Where is my mistake book?", "How do I export a PDF?"];
export function ProductHelpChat() {
  const [open, setOpen] = useState(false); const [input, setInput] = useState(""); const [messages, setMessages] = useState<Message[]>([]); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  const send = (question: string) => { const text = question.trim(); if (!text) return; const reply = getProductHelpReply(text); setMessages((items) => [...items, { role: "user", text }, { role: "assistant", text: reply.text, fallback: reply.kind === "fallback" }]); setInput(""); };
  return <aside className="product-help-widget"><button className="product-help-launcher" aria-expanded={open} aria-controls="product-help-panel" onClick={() => setOpen((value) => !value)}>Help</button>{open && <section id="product-help-panel" className="product-help-panel" aria-label="Product help chat"><header><div><strong>Paper Plane Help</strong><span>Questions about using the app</span></div><button aria-label="Close help" onClick={() => setOpen(false)}>x</button></header><div className="product-help-messages" aria-live="polite">{messages.length === 0 && <p>Ask about uploads, question types, your mistake book, or PDF exports.</p>}{messages.map((message, index) => <div className={`product-help-message ${message.role}`} key={`${message.role}-${index}`}>{message.text}{message.fallback && <a href="mailto:haotianwu123%40berkeley.edu?subject=Paper%20Plane%20Quiz%20feedback">Send feedback</a>}</div>)}</div><div className="product-help-suggestions">{suggestions.map((question) => <button key={question} onClick={() => send(question)}>{question}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); send(input); }}><label className="sr-only" htmlFor="product-help-question">Ask about using Paper Plane Quiz</label><input ref={inputRef} id="product-help-question" aria-label="Ask about using Paper Plane Quiz" value={input} onChange={(event) => setInput(event.target.value)} /><button type="submit" aria-label="Send help question" disabled={!input.trim()}>Send</button></form></section>}</aside>;
}
```

Add fixed mobile-safe styles with a scrollable panel, visible close control, bright coral/sky/yellow launcher, and panel content that never blocks quiz action controls. Do not use `fetch`, `FormData`, `localStorage`, route handlers, quiz state, files, transcripts, or question-chat code.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- components/product-help-chat.test.tsx lib/product-help.test.ts`

Expected: PASS and no fetch calls.

- [ ] **Step 5: Commit**

```powershell
git add components/product-help-chat.tsx components/product-help-chat.test.tsx app/globals.css
git commit -m "feat: add offline product help chat"
```

### Task 4: Wire Help into the page and workspace

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/page.test.tsx`
- Modify: `components/quiz-workspace.tsx`
- Modify: `components/quiz-workspace.test.tsx`

- [ ] **Step 1: Write failing integration tests**

```tsx
it("provides the public Help navigation link", () => {
  render(<Home />);
  expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "#help");
});
it("opens the help center from the help hash", async () => {
  window.location.hash = "#help";
  render(<QuizWorkspace />);
  expect(await screen.findByRole("heading", { name: "Small steps, clear answers." })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/page.test.tsx components/quiz-workspace.test.tsx`

Expected: FAIL because there is no Help link or `help` view.

- [ ] **Step 3: Implement routing and page mounting**

```tsx
// app/page.tsx
import { ProductHelpChat } from "@/components/product-help-chat";
// Add alongside the existing header links:
<a className="mistake-nav-link" href="#help">Help</a>
// Mount once after the workspace:
<ProductHelpChat />

// components/quiz-workspace.tsx
import { HelpCenter } from "@/components/help-center";
type View = "upload" | "transcribing" | "reviewing" | "generating" | "quiz" | "results" | "mistakes" | "history" | "progress" | "session-review" | "help";
// Extend the existing hash effect:
if (window.location.hash === "#help") setView("help");
// Add before upload rendering:
if (view === "help") return <HelpCenter onBack={reset} />;
```

Extend the existing `openFromHash` function rather than adding a second listener. The Help back action calls `reset`. Do not modify `ask`, `/api/question-chat`, uploaded files, or transcript flow.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/page.test.tsx components/quiz-workspace.test.tsx components/help-center.test.tsx`

Expected: PASS with existing upload, transcription, and PDF-export tests remaining green.

- [ ] **Step 5: Commit**

```powershell
git add app/page.tsx app/page.test.tsx components/quiz-workspace.tsx components/quiz-workspace.test.tsx
git commit -m "feat: connect help center to workspace"
```

### Task 5: Verify and release

**Files:**
- Modify only if verification exposes a defect: `lib/product-help.ts`, `components/help-center.tsx`, `components/product-help-chat.tsx`, `app/globals.css`

- [ ] **Step 1: Run feature tests**

Run: `npm test -- lib/product-help.test.ts components/help-center.test.tsx components/product-help-chat.test.tsx app/page.test.tsx components/quiz-workspace.test.tsx`

Expected: PASS for search, fallback, local-only support boundary, Help entry point, and existing workspace behavior.

- [ ] **Step 2: Run the full suite**

Run: `npm test; npm run typecheck; npm run lint; npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Verify desktop and mobile behavior**

Run: `npm run dev`

At the local URL, test the top Help link, article search, widget open/close, Escape close, a PDF answer, an unsupported-question feedback link, and that the widget does not request `/api/question-chat`. Repeat at 390 px width and verify the widget remains fully visible with a scrollable message area.

- [ ] **Step 4: Deploy and verify production**

Run: `npx vercel --prod --yes`

Expected: Vercel reports `READY`. At `https://paper-quiz-ai-amber.vercel.app`, confirm Help and the floating panel are present, the FAQ answer works without an API request, and the fallback shows Feedback.

- [ ] **Step 5: Commit verification fixes if needed**

```powershell
git add lib/product-help.ts components/help-center.tsx components/product-help-chat.tsx app/globals.css
git commit -m "fix: polish product help experience"
```

