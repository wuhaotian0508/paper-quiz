"use client";

import { useMemo, useState } from "react";
import { createFeedbackHref } from "@/lib/feedback";
import { findHelpArticles, productHelpArticles } from "@/lib/product-help";

export function HelpCenter({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const articles = useMemo(
    () => (query.trim() ? findHelpArticles(query) : productHelpArticles),
    [query],
  );

  return (
    <section className="help-page">
      <header className="help-heading">
        <div>
          <div className="eyebrow">Help center</div>
          <h1>Small steps, clear answers.</h1>
          <p className="muted-copy">Find a feature, then get back to studying.</p>
        </div>
        <button className="text-button" onClick={onBack}>
          Back to quiz
        </button>
      </header>
      <label className="help-search">
        Search help
        <input
          type="search"
          aria-label="Search help"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try export PDF or mistake book"
        />
      </label>
      {articles.length ? (
        <div className="help-article-list">
          {articles.map((article) => (
            <article className="help-article" key={article.id}>
              <span>{article.category}</span>
              <h2>{article.title}</h2>
              <p>{article.summary}</p>
              <ol>
                {article.body.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      ) : (
        <div className="help-empty">
          <h2>No matching help article</h2>
          <p>Tell us what you were trying to do.</p>
          <a className="primary-button" href={createFeedbackHref(`Help search: ${query.trim()}`)}>
            Send feedback
          </a>
        </div>
      )}
    </section>
  );
}
