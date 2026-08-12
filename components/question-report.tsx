"use client";

import { useEffect, useState } from "react";
import { postForm } from "@/lib/api-client";
import { createFeedbackHref } from "@/lib/feedback";
import {
  addReportedQuestion,
  buildQuestionReport,
  hasReportedQuestion,
  MAX_REPORT_NOTE_CHARS,
  QUESTION_REPORTS_KEY,
  readReportedQuestions,
  reportReasonsFor,
  type QuestionReportReason,
} from "@/lib/question-report";
import { questionKey, type Question } from "@/lib/quiz";
import { addLearning, GENERATION_LEARNINGS_KEY, readLearnings } from "@/lib/generation-learnings";
import { isTeachableVerdict, shouldVerify, type QuestionVerdict } from "@/lib/question-verdict";
import { safeStorageSet } from "@/lib/request-validation";
import { hasSource, type PersistedSource } from "@/lib/study-history";
import { useLocale } from "@/hooks/use-locale";
import type { MessageKey } from "@/lib/i18n";

const reasonKeys: Record<QuestionReportReason, MessageKey> = {
  wrong_answer: "report.reasonWrongAnswer",
  bad_options: "report.reasonBadOptions",
  not_in_source: "report.reasonNotInSource",
  unclear: "report.reasonUnclear",
  other: "report.reasonOther",
};

const verdictHeadingKeys: Record<QuestionVerdict["verdict"], MessageKey> = {
  confirmed: "report.verdictConfirmed",
  stands: "report.verdictStands",
  unclear: "report.verdictUnclear",
};

/**
 * The "this question is wrong" control that sits under a question wherever one is shown.
 *
 * Self-contained on purpose: it owns its own request, its own already-reported memory and
 * its own failure message, so adding it to another surface is one line and never widens
 * that surface's state.
 */
export function QuestionReport({
  question,
  quizTitle,
  materialName,
  source,
}: {
  question: Question;
  quizTitle?: string;
  materialName?: string;
  /**
   * The study material the question came from. Optional because a report is worth filing
   * without it — a restored session may no longer hold the source — but supplying it is
   * what upgrades the report from a complaint into an answer.
   */
  source?: PersistedSource;
}) {
  const { locale, t } = useLocale();
  const key = questionKey(question);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<QuestionReportReason | "">("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [reported, setReported] = useState(false);
  const [verdict, setVerdict] = useState<QuestionVerdict | null>(null);
  const [error, setError] = useState("");

  // Read in an effect, like every other stored preference here, so the server render and the
  // first client render agree before storage is consulted.
  useEffect(() => {
    setReported(
      hasReportedQuestion(
        readReportedQuestions(window.localStorage.getItem(QUESTION_REPORTS_KEY)),
        key,
      ),
    );
    setOpen(false);
    setReason("");
    setNote("");
    setStatus("idle");
    setVerdict(null);
    setError("");
  }, [key]);

  /**
   * A confirmed serious fault becomes a rule for this browser's later runs on this material.
   * Only the rule id and a short scope label are kept: the learner's own words never travel
   * into a future prompt, which is what keeps a report box from being an injection channel.
   */
  const rememberLesson = (checked: QuestionVerdict) => {
    if (!isTeachableVerdict(checked)) return;
    const stored = addLearning(
      readLearnings(window.localStorage.getItem(GENERATION_LEARNINGS_KEY)),
      {
        rule: checked.rule,
        scope: checked.scope ?? "",
        materialName: source?.materialName || materialName || "",
        questionKey: key,
      },
    );
    safeStorageSet(GENERATION_LEARNINGS_KEY, JSON.stringify(stored));
  };

  const send = async () => {
    if (!reason) return setError(t("report.chooseReason"));
    setError("");
    setStatus("sending");
    try {
      const report = buildQuestionReport(question, reason, {
        note,
        quizTitle,
        materialName,
        locale,
      });
      const form = new FormData();
      for (const [field, value] of Object.entries(report)) form.set(field, String(value));
      // Beside the report, not inside it: these let the server re-read the material and
      // answer the complaint instead of merely filing it.
      form.set("question", JSON.stringify(question));
      if (source?.fileIds?.length) form.set("fileIds", JSON.stringify(source.fileIds));
      else if (source?.fileId) form.set("fileId", source.fileId);
      else if (source?.transcript) form.set("transcript", source.transcript);

      const response = await postForm("/api/report-question", form, {
        timeoutMessage: t("report.failed"),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        verdict?: QuestionVerdict | null;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || t("report.failed"));
      if (data.verdict) {
        setVerdict(data.verdict);
        rememberLesson(data.verdict);
      }

      const stored = addReportedQuestion(
        readReportedQuestions(window.localStorage.getItem(QUESTION_REPORTS_KEY)),
        key,
        reason,
      );
      safeStorageSet(QUESTION_REPORTS_KEY, JSON.stringify(stored));
      setReported(true);
      setStatus("sent");
      setOpen(false);
    } catch (cause) {
      setStatus("failed");
      setError(cause instanceof Error ? cause.message : t("report.failed"));
    }
  };

  if (reported)
    return (
      <div className={`question-report-done is-${verdict?.verdict ?? "filed"}`} role="status">
        <p>{t(status === "sent" ? "report.sent" : "report.alreadyReported")}</p>
        {/* The reply the learner actually came for: not "thank you", but what the material says. */}
        {verdict && (
          <div className="question-report-verdict">
            <strong>{t(verdictHeadingKeys[verdict.verdict])}</strong>
            <p>{verdict.finding}</p>
            {verdict.correctedAnswer && (
              <p>
                <strong>{t("report.verdictCorrected")}</strong> {verdict.correctedAnswer}
              </p>
            )}
            {isTeachableVerdict(verdict) && <p>{t("report.verdictLearned")}</p>}
          </div>
        )}
      </div>
    );

  if (!open)
    return (
      <div className="question-report">
        <button className="question-report-open" onClick={() => setOpen(true)}>
          {t("report.open")}
        </button>
        {status === "failed" && error && (
          <span className="error-message">
            {error} <a href={createFeedbackHref()}>{t("report.failedLink")}</a>
          </span>
        )}
      </div>
    );

  return (
    <div className="question-report is-open">
      <fieldset className="question-report-reasons">
        <legend>{t("report.heading")}</legend>
        {reportReasonsFor(question.type).map((value) => (
          <label className={reason === value ? "is-selected" : ""} key={value}>
            <input
              checked={reason === value}
              name={`report-reason-${key}`}
              type="radio"
              value={value}
              onChange={() => {
                setReason(value);
                setError("");
              }}
            />
            <span>{t(reasonKeys[value])}</span>
          </label>
        ))}
      </fieldset>
      <label className="question-report-note">
        <span>{t("report.noteLabel")}</span>
        <textarea
          maxLength={MAX_REPORT_NOTE_CHARS}
          placeholder={t("report.notePlaceholder")}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <p className="question-report-privacy">{t("report.privacy")}</p>
      {error && (
        <div className="error-message">
          {error}
          {status === "failed" && <a href={createFeedbackHref()}> {t("report.failedLink")}</a>}
        </div>
      )}
      <div className="question-report-actions">
        <button className="text-button" onClick={() => setOpen(false)}>
          {t("report.cancel")}
        </button>
        <button
          className="primary-button"
          disabled={status === "sending"}
          onClick={() => void send()}
        >
          {status !== "sending"
            ? t("report.send")
            : // A check reads the whole PDF, so the wait is longer than a form post and the
              // label has to say why rather than leave the learner watching "Sending...".
              t(
                reason && shouldVerify(reason) && hasSource(source)
                  ? "report.checking"
                  : "report.sending",
              )}
        </button>
      </div>
    </div>
  );
}
