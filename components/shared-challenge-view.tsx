"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  loadSharedChallenge,
  submitSharedChallenge,
  type SharedChallengeClient,
} from "@/lib/shared-challenge-client";
import { useLocale } from "@/hooks/use-locale";

const PublicQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("multiple_choice"),
    prompt: z.string().min(1),
    options: z.array(z.object({ id: z.enum(["a", "b", "c", "d"]), text: z.string().min(1) })).length(4),
  }),
  z.object({ id: z.string().min(1), type: z.literal("fill_blank"), prompt: z.string().min(1) }),
  z.object({
    id: z.string().min(1),
    type: z.enum(["short_answer", "custom"]),
    prompt: z.string().min(1),
    customLabel: z.string().nullable(),
  }),
]);
const ChallengeSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  quiz: z.object({ questions: z.array(PublicQuestionSchema).min(1) }),
});
const ResultSchema = z.object({
  score: z.number().nullable().optional(),
  objectiveCount: z.number().optional(),
  results: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      score: z.number().nullable().optional(),
      feedback: z.string(),
      referenceAnswer: z.string().optional(),
      correctOptionId: z.string().optional(),
    }),
  ),
});

export function SharedChallengeView({ slug, client }: { slug: string; client?: SharedChallengeClient }) {
  const [challenge, setChallenge] = useState<z.infer<typeof ChallengeSchema> | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const { t } = useLocale();
  const [result, setResult] = useState<z.infer<typeof ResultSchema> | null>(null);
  const [message, setMessage] = useState(t("shared.loadingChallenge"));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const resolvedClient = client ?? (getSupabaseBrowserClient() as unknown as SharedChallengeClient);
        const data = ChallengeSchema.parse(await loadSharedChallenge(resolvedClient, slug));
        if (!active) return;
        setChallenge(data);
        setMessage("");
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : t("shared.challengeUnavailable"));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [client, slug, t]);

  async function submit() {
    if (!challenge) return;
    setSubmitting(true);
    setMessage("");
    try {
      const resolvedClient = client ?? (getSupabaseBrowserClient() as unknown as SharedChallengeClient);
      setResult(ResultSchema.parse(await submitSharedChallenge(resolvedClient, challenge.slug, answers, name)));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("shared.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!challenge) {
    return <main className="shared-challenge-page"><p role="status">{message}</p></main>;
  }

  return (
    <main className="shared-challenge-page">
      <div className="eyebrow">{t("shared.challengeEyebrow")}</div>
      <h1>{challenge.title}</h1>
      <p className="muted-copy">{challenge.summary}</p>
      <p className="shared-challenge-note">{t("shared.challengeNote")}</p>
      <div className="shared-link-actions">
        <a className="text-button framed-button" href={`/login?returnTo=${encodeURIComponent(`/challenge/${challenge.slug}`)}`}>
          {t("shared.signIn")}
        </a>
        <a className="primary-button" href="#shared-quiz">
          {t("shared.useThisQuiz")}
        </a>
      </div>
      {!result ? (
        <>
          <label className="shared-name">
            {t("shared.displayName")}
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t("shared.anonymous")} />
          </label>
          <div className="shared-question-list" id="shared-quiz">
            {challenge.quiz.questions.map((question, index) => (
              <section className="shared-question" key={question.id}>
                <span className="question-kicker">
                  {t("shared.questionKicker")} {String(index + 1).padStart(2, "0")}
                </span>
                <h2>{question.prompt}</h2>
                {question.type === "multiple_choice" ? (
                  <div className="option-list">
                    {question.options.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        aria-label={option.text}
                        className={`answer-option ${answers[question.id] === option.id ? "is-selected" : ""}`}
                        onClick={() => setAnswers((old) => ({ ...old, [question.id]: option.id }))}
                      >
                        <span className="option-letter">{option.id.toUpperCase()}</span><span>{option.text}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="written-answer"
                    aria-label={t("shared.answerForAria", { number: index + 1 })}
                    value={answers[question.id] || ""}
                    onChange={(event) => setAnswers((old) => ({ ...old, [question.id]: event.target.value }))}
                    rows={question.type === "fill_blank" ? 3 : 6}
                  />
                )}
              </section>
            ))}
          </div>
          <button className="primary-button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? t("shared.submitting") : t("shared.submitChallenge")}
          </button>
          {message ? <p className="share-status" role="status">{message}</p> : null}
        </>
      ) : (
        <section className="shared-results">
          <h2>
            {result.score === null || result.score === undefined
              ? t("shared.answersSubmitted")
              : t("shared.score", { score: Math.round(result.score * 100) })}
          </h2>
          {result.results.map((item) => (
            <article key={item.id} className="shared-result-item">
              <strong>
                {item.status === "correct"
                  ? t("shared.correct")
                  : item.status === "self_review"
                    ? t("shared.selfReview")
                    : t("shared.reviewThis")}
              </strong>
              <p>{item.feedback}</p>
              {item.referenceAnswer ? (
                <p>{t("shared.referenceAnswer", { answer: item.referenceAnswer })}</p>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
