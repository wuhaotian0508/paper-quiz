"use client";

import { useState } from "react";

const materials = [
  { id: "algorithms", title: "Lecture 12 - Algorithms.pdf", questions: 20, topics: 6 },
  { id: "graphs", title: "Lecture 11 - Graphs.pdf", questions: 16, topics: 5 },
  { id: "midterm", title: "Midterm review notes.pdf", questions: 12, topics: 4 },
] as const;

type Page = "upload" | "review";
type Theme = "light" | "dark";
type MaterialId = (typeof materials)[number]["id"];

const topicLabels = ["Algorithms", "Data Structures", "Time Complexity", "Graphs", "Sorting"];

export function FrontendPreview() {
  const [page, setPage] = useState<Page>("upload");
  const [theme, setTheme] = useState<Theme>("light");
  const [materialId, setMaterialId] = useState<MaterialId>("algorithms");
  const [questionType, setQuestionType] = useState("Multiple choice");
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const material = materials.find((item) => item.id === materialId) ?? materials[0];

  function goHome() {
    setPage("upload");
  }

  return (
    <main className="frontend-preview" data-testid="frontend-preview" data-theme={theme}>
      <div className="frontend-preview-shell">
        <header className="frontend-preview-nav">
          <button
            className="frontend-preview-brand"
            type="button"
            aria-label="PaperQuiz AI home"
            onClick={goHome}
          >
            <span className="frontend-preview-brand-mark" aria-hidden="true">
              &gt;
            </span>
            <span>PaperQuiz AI</span>
          </button>

          <ol className="frontend-preview-steps" aria-label="Quiz workflow">
            <li className={page === "upload" ? "is-active" : ""}>
              <span>1</span>Upload &amp; Configure
            </li>
            <li>
              <span>2</span>Generate
            </li>
            <li className={page === "review" ? "is-active" : ""}>
              <span>3</span>Review &amp; Explore
            </li>
            <li>
              <span>4</span>Practice
            </li>
          </ol>

          <div className="frontend-preview-nav-actions">
            <button
              className="frontend-preview-theme-button"
              type="button"
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              onClick={() => setTheme((value) => (value === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <button className="frontend-preview-feedback" type="button">
              Feedback
            </button>
          </div>
        </header>

        <div className="frontend-preview-tablist" role="tablist" aria-label="Preview pages">
          <button
            type="button"
            role="tab"
            aria-selected={page === "upload"}
            onClick={() => setPage("upload")}
          >
            Upload and Configure
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={page === "review"}
            onClick={() => setPage("review")}
          >
            Review and Explore
          </button>
        </div>

        {page === "upload" ? (
          <section
            className="frontend-preview-page frontend-preview-upload-page"
            aria-labelledby="preview-upload-title"
          >
            <div className="frontend-preview-upload-card">
              <h1 id="preview-upload-title" aria-label="Upload your materials">
                <span aria-hidden="true">1</span>Upload your materials
              </h1>
              <div className="frontend-preview-dropzone">
                <div className="frontend-preview-upload-icon" aria-hidden="true">
                  ^
                </div>
                <strong>Drop a PDF or lecture recording here</strong>
                <small>PDF, MP3, M4A, WAV, or other audio - Max 200MB</small>
              </div>
              <div className="frontend-preview-file-row">
                <span className="frontend-preview-file-type">PDF</span>
                <span>
                  <strong>Lecture_12_Algorithms.pdf</strong>
                  <small>2.4 MB</small>
                </span>
                <b aria-label="File ready">Ready</b>
              </div>

              <h2>
                <span>2</span>Configure your quiz
              </h2>
              <p className="frontend-preview-field-label">Question mix</p>
              <div className="frontend-preview-question-types">
                {["Multiple choice", "Fill in the blank", "Short answer"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={questionType === type ? "is-selected" : ""}
                    onClick={() => setQuestionType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <div className="frontend-preview-config-grid">
                <label>
                  Focus area (optional)
                  <select defaultValue="all">
                    <option value="all">All topics</option>
                    <option value="algorithms">Algorithms</option>
                    <option value="graphs">Graphs</option>
                  </select>
                </label>
                <label>
                  Difficulty
                  <select defaultValue="balanced">
                    <option value="basic">Core review</option>
                    <option value="balanced">Balanced</option>
                    <option value="challenge">Challenge</option>
                  </select>
                </label>
              </div>
              <div className="frontend-preview-switches">
                <label>
                  <input
                    type="checkbox"
                    checked={includeExplanations}
                    onChange={(event) => setIncludeExplanations(event.target.checked)}
                  />
                  Include explanations
                </label>
                <label>
                  <input type="checkbox" />
                  Challenge mode <small>beta</small>
                </label>
              </div>
              <details className="frontend-preview-advanced">
                <summary>Advanced options</summary>
                <p>Keep exact question counts and custom question types here.</p>
              </details>
              <button
                className="frontend-preview-primary"
                type="button"
                onClick={() => setPage("review")}
              >
                Generate quiz
              </button>
            </div>
          </section>
        ) : (
          <section
            className="frontend-preview-page frontend-preview-review-page"
            aria-labelledby="preview-review-title"
          >
            <div className="frontend-preview-source-bar">
              <div>
                <span className="frontend-preview-file-type">PDF</span>
                <p>
                  <strong>Reviewing: {material.title}</strong>
                  <small>{material.questions} generated questions - last generated just now</small>
                </p>
              </div>
              <label className="sr-only" htmlFor="preview-material">
                Review material
              </label>
              <select
                id="preview-material"
                aria-label="Review material"
                value={materialId}
                onChange={(event) => setMaterialId(event.target.value as MaterialId)}
              >
                {materials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="frontend-preview-overview">
              <div className="frontend-preview-overview-heading">
                <h1 id="preview-review-title" aria-label="AI generated for you">
                  AI generated for you <em aria-hidden="true">+</em>
                </h1>
                <span>Preview</span>
              </div>
              <div className="frontend-preview-metrics">
                <div>
                  <strong>{material.questions}</strong>
                  <small>Questions</small>
                </div>
                <div>
                  <strong>{material.topics}</strong>
                  <small>Topics</small>
                </div>
                <div>
                  <strong>3</strong>
                  <small>Difficulty levels</small>
                </div>
                <div>
                  <strong>~12 min</strong>
                  <small>Est. time</small>
                </div>
              </div>
              <p className="frontend-preview-field-label">Topics covered</p>
              <div className="frontend-preview-topics">
                {topicLabels.map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
                <span>+1 more</span>
              </div>
            </div>
            <article className="frontend-preview-question-card">
              <h2>Sample questions</h2>
              <div className="frontend-preview-question-grid">
                <div>
                  <p className="frontend-preview-question-prompt">
                    <span>MCQ</span>What is the time complexity of binary search on a sorted array
                    of n elements?
                  </p>
                  <div className="frontend-preview-answers">
                    <div>
                      <b>A</b>O(1)
                    </div>
                    <div className="is-correct">
                      <b>B</b>O(log n)
                    </div>
                    <div>
                      <b>C</b>O(n)
                    </div>
                    <div>
                      <b>D</b>O(n log n)
                    </div>
                  </div>
                </div>
                <aside>
                  <strong>Explanation</strong>
                  <p>
                    Binary search divides the search interval in half each time. The number of steps
                    is proportional to log<sub>2</sub> n.
                  </p>
                  <span>Easy</span>
                </aside>
              </div>
            </article>
            <div className="frontend-preview-actions">
              <button type="button">
                <b>Export</b>
                <span>PDF or DOCX</span>
              </button>
              <button type="button">
                <b>Answer key</b>
                <span>Download separately</span>
              </button>
              <button type="button">
                <b>Share</b>
                <span>Shareable link</span>
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
