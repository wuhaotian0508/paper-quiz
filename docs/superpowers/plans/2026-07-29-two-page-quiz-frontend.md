# Two-page quiz frontend implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive `/frontend-preview` route that demonstrates the approved two-page PaperQuiz AI flow in light and dark themes.

**Architecture:** A presentation-only client component owns active page, theme, and material selection. A thin App Router page renders it. The existing home page, `QuizWorkspace`, APIs, storage, and authentication do not change.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS custom properties, Vitest, React Testing Library.

---

### Task 1: Write failing interaction tests

**Files:**
- Create: `components/frontend-preview.test.tsx`
- Create: `components/frontend-preview.tsx`

- [ ] **Step 1: Add a test that expects the upload view and a dark-theme switch**

```tsx
it("starts on upload and switches the preview theme", () => {
  render(<FrontendPreview />);
  expect(screen.getByRole("heading", { name: "Upload your materials" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(screen.getByTestId("frontend-preview")).toHaveAttribute("data-theme", "dark");
});
```

- [ ] **Step 2: Run `npm test -- components/frontend-preview.test.tsx` and confirm a module-resolution failure for `./frontend-preview`**

- [ ] **Step 3: Add a test that opens Review, changes `Review material` to `graphs`, then clicks `PaperQuiz AI home`**

```tsx
fireEvent.click(screen.getByRole("tab", { name: "Review and Explore" }));
fireEvent.change(screen.getByLabelText("Review material"), { target: { value: "graphs" } });
expect(screen.getByText("Reviewing: Lecture 11 - Graphs.pdf")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "PaperQuiz AI home" }));
expect(screen.getByRole("heading", { name: "Upload your materials" })).toBeInTheDocument();
```

- [ ] **Step 4: Re-run `npm test -- components/frontend-preview.test.tsx` and confirm it still fails because the component does not exist**

### Task 2: Implement the isolated component

**Files:**
- Create: `components/frontend-preview.tsx`
- Modify: `components/frontend-preview.test.tsx`

- [ ] **Step 1: Add a client component with the following data and state**

```tsx
const materials = [
  { id: "algorithms", title: "Lecture 12 - Algorithms.pdf", questions: 20, topics: 6 },
  { id: "graphs", title: "Lecture 11 - Graphs.pdf", questions: 16, topics: 5 },
  { id: "midterm", title: "Midterm review notes.pdf", questions: 12, topics: 4 },
] as const;
const [page, setPage] = useState<"upload" | "review">("upload");
const [theme, setTheme] = useState<"light" | "dark">("light");
const [materialId, setMaterialId] = useState<(typeof materials)[number]["id"]>("algorithms");
```

- [ ] **Step 2: Render a semantic header with a brand reset button, a labeled light/dark button, and two `role="tab"` page controls**

- [ ] **Step 3: Render Page 1 as upload/configure only; render Page 2 with a native `select` labelled `Review material`, a `Reviewing: {material.title}` label, metrics, a sample question, explanation, and action bar**

- [ ] **Step 4: Run `npm test -- components/frontend-preview.test.tsx` and confirm both interaction tests pass without console warnings**

- [ ] **Step 5: Commit only the component and test: `git add components/frontend-preview.tsx components/frontend-preview.test.tsx && git commit -m "feat: add two-page frontend preview"`**

### Task 3: Add the route and scoped visual system

**Files:**
- Create: `app/frontend-preview/page.tsx`
- Modify: `components/frontend-preview.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add the route:**

```tsx
import { FrontendPreview } from "@/components/frontend-preview";
export default function FrontendPreviewPage() { return <FrontendPreview />; }
```

- [ ] **Step 2: Add namespaced `frontend-preview-*` styles with light tokens `#f7f8fd`, `#ffffff`, `#1c2741`, `#5261f6`, `#7d3df0`, and dark tokens `#0c172a`, `#11203a`, `#f0f4ff`, `#7a80ff`, `#a65cff`**

- [ ] **Step 3: Use a four-column metric grid and a two-column question/explanation grid; under `780px`, make metrics two columns and stack the question pane, source selector, and action bar**

- [ ] **Step 4: Run `npm test -- components/frontend-preview.test.tsx && npm run typecheck`; expect success for both commands**

- [ ] **Step 5: Commit route and styles: `git add app/frontend-preview/page.tsx components/frontend-preview.tsx app/globals.css && git commit -m "feat: style frontend preview route"`**

### Task 4: Verify the preview and preserve the existing product

**Files:**
- Test: `components/frontend-preview.test.tsx`

- [ ] **Step 1: Run `npm test && npm run lint && npm run format:check && npm run typecheck && npm run build`; expect all commands to exit with code 0**

- [ ] **Step 2: Run `npm run dev`; verify `/frontend-preview` changes pages, themes, and active PDF, while `/` still renders the existing application**

- [ ] **Step 3: At 375px, verify no horizontal overflow and keyboard reachability for every button and select**
