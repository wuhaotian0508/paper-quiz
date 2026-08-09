"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  normalizeAnswer,
  type Difficulty,
  type GradeResult,
  type Question,
  type QuestionConfiguration,
  type Quiz,
} from "@/lib/quiz";
import { readQuizResponse, type GeneratedQuiz } from "@/lib/quiz-response";
import {
  addMistake,
  mistakeKey,
  MISTAKE_BOOK_KEY,
  readMistakes,
  type MistakeBookEntry,
} from "@/lib/mistake-book";
import {
  applyOptionExplanations,
  needsOptionExplanations,
  withOptionExplanations,
  type OptionExplanations,
} from "@/lib/option-explanations";
import {
  buildMemoryContext,
  captureMemory,
  LEARNER_MEMORY_KEY,
  readMemories,
  type LearnerMemoryEntry,
} from "@/lib/learner-memory";
import {
  addSession,
  boundSource,
  EMPTY_SOURCE,
  hasSource,
  materialFromFile,
  readSessions,
  STUDY_HISTORY_KEY,
  type PersistedSource,
  type StudySession,
} from "@/lib/study-history";
import {
  findStudyMaterial,
  groupStudyMaterials,
  mergeStudyLibraryMaterials,
} from "@/lib/study-material";
import {
  createLibraryRecord,
  readStudyLibrary,
  setLibrarySubject,
  STUDY_LIBRARY_KEY,
  STUDY_LIBRARY_UPDATED_EVENT,
  STUDY_MATERIAL_OPEN_EVENT,
  upsertStudyLibrary,
  type StudyLibraryRecord,
} from "@/lib/study-library";
import { buildDailyReviewPapers } from "@/lib/daily-review";
import { ProgressDashboard } from "@/components/progress-dashboard";
import { ReadOnlyReview } from "@/components/read-only-review";
import { MistakeBookView } from "@/components/mistake-book-view";
import { LibraryView } from "@/components/library-view";
import { MaterialDetailView } from "@/components/material-detail-view";
import { LoadingView } from "@/components/loading-view";
import { ResultsView } from "@/components/results-view";
import { TranscriptReviewView } from "@/components/transcript-review-view";
import { UploadView, fixedTypes } from "@/components/upload-view";
import { QuizView, type ChatMessage } from "@/components/quiz-view";
import { HelpCenter } from "@/components/help-center";
import { ReviewSheetView } from "@/components/review-sheet-view";
import { safeStorageSet } from "@/lib/request-validation";
import { addUsage, readUsage, USAGE_METER_KEY, USAGE_METER_UPDATED_EVENT } from "@/lib/usage-meter";
import { postForm, QUIZ_TIMEOUT_MS } from "@/lib/api-client";
import { isAudio, isPdf } from "@/lib/study-file";
import { attachStudyFile, attachStudyFiles } from "@/lib/study-upload";
import { renderAndStorePdfPages } from "@/lib/source-pages";
import { useStudySync } from "@/hooks/use-study-sync";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSharedChallenge } from "@/lib/shared-challenge-client";
import { getChallengeShareUrl } from "@/lib/shared-challenge";
import { useLocale } from "@/hooks/use-locale";

type View =
  | "upload"
  | "transcribing"
  | "reviewing"
  | "generating"
  | "quiz"
  | "results"
  | "mistakes"
  | "library"
  | "progress"
  | "session-review"
  | "material-detail"
  | "help"
  | "review-sheet";

export function QuizWorkspace() {
  const { locale, t } = useLocale();
  const [view, setView] = useState<View>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [transcript, setTranscript] = useState("");
  /** Provider file id for the uploaded PDF, so grading never re-sends the document. */
  const [sourceFileId, setSourceFileId] = useState<string | null>(null);
  const [sourceFileIds, setSourceFileIds] = useState<string[]>([]);
  /** Which uploaded file this practice belongs to, so questions and mistakes group per PDF. */
  const [material, setMaterial] = useState({ materialId: "", materialName: "" });
  const [openMaterialId, setOpenMaterialId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({
    multiple_choice: 5,
    fill_blank: 0,
    short_answer: 0,
  });
  const [brief, setBrief] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, GradeResult>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [mistakes, setMistakes] = useState<MistakeBookEntry[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [library, setLibrary] = useState<StudyLibraryRecord[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [reviewSession, setReviewSession] = useState<StudySession | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  /** Question id whose per-option analysis is being backfilled, so the card can say so. */
  const [analysingOptionsFor, setAnalysingOptionsFor] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  /** Local only for now: not synced to Supabase until the injection proves itself. */
  const [memories, setMemories] = useState<LearnerMemoryEntry[]>([]);

  useEffect(() => {
    setMistakes(readMistakes(window.localStorage.getItem(MISTAKE_BOOK_KEY)));
    setSessions(readSessions(window.localStorage.getItem(STUDY_HISTORY_KEY)));
    setLibrary(readStudyLibrary(window.localStorage.getItem(STUDY_LIBRARY_KEY)));
    setMemories(readMemories(window.localStorage.getItem(LEARNER_MEMORY_KEY)));
    setStorageReady(true);
  }, []);
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#dashboard") setView("upload");
      if (window.location.hash === "#mistake-book") setView("mistakes");
      if (window.location.hash === "#progress") setView("progress");
      if (window.location.hash === "#library") setView("library");
      if (window.location.hash === "#help") setView("help");
      // Retired entries kept as redirects so existing links and bookmarks still land
      // somewhere sensible: Quiz Lab was the dashboard, and Review Sheets, History and
      // the older #materials all listed the same materials the library now owns.
      if (window.location.hash === "#quiz-lab") setView("upload");
      if (
        window.location.hash === "#history" ||
        window.location.hash === "#review-sheets" ||
        window.location.hash === "#materials"
      )
        setView("library");
    };
    window.addEventListener("hashchange", openFromHash);
    openFromHash();
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const current = quiz?.questions[index];
  /** What grading and tutor chat send as study material, whether live or restored. */
  const source: PersistedSource = boundSource({
    fileId: sourceFileId,
    fileIds: sourceFileIds,
    transcript,
    ...material,
  });
  const sourceAvailable = hasSource(source) || files.length > 0;
  const materials = useMemo(
    () => mergeStudyLibraryMaterials(groupStudyMaterials(sessions, mistakes), library),
    [library, mistakes, sessions],
  );
  /** Today's review papers, one per course. Empty until something the student missed comes due. */
  const dailyPapers = useMemo(() => buildDailyReviewPapers(mistakes, library), [library, mistakes]);
  const hydrateStudyState = useCallback(
    ({
      sessions: mergedSessions,
      mistakes: mergedMistakes,
      library: mergedLibrary,
    }: {
      sessions: StudySession[];
      mistakes: MistakeBookEntry[];
      library: StudyLibraryRecord[];
    }) => {
      setSessions(mergedSessions);
      setMistakes(mergedMistakes);
      setLibrary(mergedLibrary);
      safeStorageSet(STUDY_HISTORY_KEY, JSON.stringify(mergedSessions));
      safeStorageSet(MISTAKE_BOOK_KEY, JSON.stringify(mergedMistakes));
      safeStorageSet(STUDY_LIBRARY_KEY, JSON.stringify(mergedLibrary));
      // The sidebar reads the library straight from storage, so it has to be told.
      window.dispatchEvent(new Event(STUDY_LIBRARY_UPDATED_EVENT));
    },
    [],
  );
  const {
    user,
    status: syncStatus,
    requestMistakeDeletion,
  } = useStudySync({
    ready: storageReady,
    sessions,
    mistakes,
    library,
    onHydrate: hydrateStudyState,
  });
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("paper-quiz-sync-status", { detail: syncStatus }));
  }, [syncStatus]);
  // The sidebar edits courses straight in storage. Without re-reading, this copy stays stale
  // and the next save here — or the next sync upload — silently reverts the student's edit.
  useEffect(() => {
    const reread = () =>
      setLibrary(readStudyLibrary(window.localStorage.getItem(STUDY_LIBRARY_KEY)));
    window.addEventListener(STUDY_LIBRARY_UPDATED_EVENT, reread);
    return () => window.removeEventListener(STUDY_LIBRARY_UPDATED_EVENT, reread);
  }, []);

  /**
   * Records what a model call consumed. Nothing is charged and nothing is gated: the meter
   * only makes the running cost visible while the product is still proving it earns reuse.
   */
  const recordUsage = (usage: { inputTokens: number; outputTokens: number } | null | undefined) => {
    if (!usage) return;
    const next = addUsage(readUsage(window.localStorage.getItem(USAGE_METER_KEY)), usage);
    safeStorageSet(USAGE_METER_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(USAGE_METER_UPDATED_EVENT));
  };

  const attachSource = (form: FormData) => {
    form.set("locale", locale);
    if (sourceFileIds.length > 1) form.set("fileIds", JSON.stringify(sourceFileIds));
    else if (sourceFileId) form.set("fileId", sourceFileId);
    else if (transcript) form.set("transcript", transcript);
    else if (files.length > 1) files.forEach((file) => form.append("files", file));
    else if (files[0]) form.set("file", files[0]);
  };

  /**
   * Every graded answer now reaches the mistake book, not only the wrong ones: a correct
   * answer to a question already in the book advances it along the Ebbinghaus ladder, and
   * clearing the last box removes it. `addMistake` returns the same array when there is
   * nothing to record, which is the common case of getting a fresh question right.
   */
  const saveMistake = (question: Question, userAnswer: string, grade: GradeResult) => {
    const next = addMistake(mistakes, question, userAnswer, grade, source);
    if (next === mistakes) return;
    // A card that graduated has to leave the synced copy too, or the next merge restores it.
    const graduated = mistakes
      .filter((entry) => !next.some((item) => item.id === entry.id))
      .map((entry) => entry.id);
    setMistakes(next);
    safeStorageSet(MISTAKE_BOOK_KEY, JSON.stringify(next));
    if (graduated.length) requestMistakeDeletion(graduated);
  };

  /**
   * Fills in per-option analysis for a question that has none.
   *
   * Every question saved before per-option analysis existed — the whole of an established
   * mistake book — renders an empty analysis block, so the explanation is fetched the first
   * time such a question is answered and written back to both the live quiz and the mistake
   * book entry. Failure is deliberately silent: the block simply stays empty, which is the
   * behaviour these questions had anyway.
   */
  const backfillOptionAnalysis = async (question: Question) => {
    if (!needsOptionExplanations(question)) return;
    setAnalysingOptionsFor(question.id);
    try {
      const form = new FormData();
      form.set("question", JSON.stringify(question));
      attachSource(form);
      const response = await postForm("/api/explain-options", form, {
        timeoutMessage: t("error.optionAnalysisTimeout"),
      });
      const data = (await response.json()) as OptionExplanations & { error?: string };
      if (!response.ok) throw new Error(data.error || t("error.optionAnalysisFailed"));

      recordUsage(
        (data as unknown as { usage?: { inputTokens: number; outputTokens: number } }).usage,
      );
      setQuiz((old) => (old ? applyOptionExplanations(old, question.id, data) : old));
      // Keyed on content, not `question.id`: a mistake-book review renumbers questions to the
      // entry id, while a normal quiz numbers from q1, and only `mistakeKey` matches both.
      const entryId = mistakeKey(question);
      setMistakes((old) => {
        const next = old.map((entry) =>
          entry.id === entryId
            ? { ...entry, question: withOptionExplanations(entry.question, data) }
            : entry,
        );
        if (next.some((entry, at) => entry !== old[at]))
          safeStorageSet(MISTAKE_BOOK_KEY, JSON.stringify(next));
        return next;
      });
    } catch {
      // Nothing to report: the analysis block is supplementary to the grade already shown.
    } finally {
      setAnalysingOptionsFor("");
    }
  };

  const recordGrade = (question: Question, userAnswer: string, grade: GradeResult) => {
    setAnswers((old) => ({ ...old, [question.id]: userAnswer }));
    setGrades((old) => ({ ...old, [question.id]: grade }));
    saveMistake(question, userAnswer, grade);
    setSubmitted(true);
    void backfillOptionAnalysis(question);
  };

  const acceptFiles = (next?: FileList | File[]) => {
    const selected = Array.from(next || []);
    if (!selected.length) return;
    const hasRecording = selected.some(isAudio);
    if (
      selected.some((file) => !isPdf(file) && !isAudio(file)) ||
      (hasRecording && (selected.length !== 1 || !isAudio(selected[0])))
    )
      return setError(t("error.chooseStudyFile"));
    setError("");
    const uploadedAt = new Date().toISOString();
    const nextLibrary: StudyLibraryRecord[] = selected.filter(isPdf).map((file) => {
      const nextMaterial = materialFromFile(file);
      // The course is guessed from the file name here, at first sight of the upload.
      return createLibraryRecord({
        id: nextMaterial.materialId,
        name: nextMaterial.materialName,
        uploadedAt,
      });
    });
    if (nextLibrary.length) {
      setLibrary((previous) => {
        const merged = nextLibrary.reduce(upsertStudyLibrary, previous);
        safeStorageSet(STUDY_LIBRARY_KEY, JSON.stringify(merged));
        window.dispatchEvent(new Event(STUDY_LIBRARY_UPDATED_EVENT));
        return merged;
      });
    }
    setSourceFileId(null);
    setSourceFileIds([]);
    setMaterial(materialFromFile(selected[0]));
    setFiles(selected);
    selected.filter(isPdf).forEach((file) => {
      const nextMaterial = materialFromFile(file);
      void renderAndStorePdfPages(file, nextMaterial.materialId);
    });
  };

  const config = (): QuestionConfiguration[] =>
    fixedTypes
      .map(([type]) => ({ type, count: counts[type] || 0 }) as QuestionConfiguration)
      .filter((item) => item.count > 0);

  const generateQuiz = async () => {
    const questions = config();
    const total = questions.reduce((sum, item) => sum + item.count, 0);
    if (!files.length && !transcript.trim()) return setError(t("error.chooseFileOrTranscript"));
    if (!questions.length || total < 1) return setError(t("error.chooseAtLeastOne"));
    if (total > 15) return setError(t("error.maxQuestions"));
    setError("");
    setLoading(true);
    setView("generating");
    try {
      const form = new FormData();
      if (transcript.trim()) form.set("transcript", transcript.trim());
      else if (files.length) await attachStudyFiles(form, files);
      form.set("questions", JSON.stringify(questions));
      form.set("count", String(total));
      form.set("locale", locale);
      if (brief.trim()) form.set("brief", brief.trim());
      const response = await postForm("/api/generate-quiz", form, {
        timeoutMs: QUIZ_TIMEOUT_MS,
        timeoutMessage: t("error.quizTimeout"),
      });
      const data = await readQuizResponse(response);
      if (!response.ok) throw new Error("error" in data ? data.error : t("error.quizFailed"));
      const generated = data as GeneratedQuiz;
      recordUsage((generated as { usage?: { inputTokens: number; outputTokens: number } }).usage);
      const rawSourceFileIds = generated.sourceFileIds || [];
      const generatedSourceFileIds =
        rawSourceFileIds.length === files.length &&
        rawSourceFileIds.every((id): id is string => typeof id === "string")
          ? rawSourceFileIds
          : [];
      setSourceFileIds(generatedSourceFileIds);
      setSourceFileId(generatedSourceFileIds[0] ?? generated.sourceFileId ?? null);
      setQuiz({
        title: generated.title,
        summary: generated.summary,
        questions: generated.questions,
      });
      setSessionId(crypto.randomUUID());
      setIndex(0);
      setAnswers({});
      setGrades({});
      setAnswer("");
      setSubmitted(false);
      setChat([]);
      setShareStatus("");
      setView("quiz");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error.quizFailed"));
      setView("upload");
    } finally {
      setLoading(false);
    }
  };

  const transcribe = async () => {
    const file = files[0];
    if (!file) return;
    setView("transcribing");
    try {
      const form = new FormData();
      await attachStudyFile(form, file);
      const response = await postForm("/api/transcribe", form, {
        timeoutMessage: t("error.transcribeTimeout"),
      });
      const data = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !data.transcript)
        throw new Error(data.error || t("error.transcribeFailed"));
      setTranscript(data.transcript);
      setView("reviewing");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error.transcribeFailed"));
      setView("upload");
    }
  };

  const submit = async () => {
    if (!current || !answer.trim()) return;
    setError("");
    if (current.type === "multiple_choice") {
      const isCorrect = answer === current.correctOptionId;
      return recordGrade(current, answer, {
        status: isCorrect ? "correct" : "incorrect",
        score: isCorrect ? 1 : 0,
        feedback: current.explanation,
        missingPoints: [],
      });
    }
    // Fill-blank is checked against the accepted answers locally: no API call, and it
    // keeps working when the source material is no longer loaded.
    if (current.type === "fill_blank") {
      const isCorrect = current.acceptedAnswers.some(
        (accepted) => normalizeAnswer(accepted) === normalizeAnswer(answer),
      );
      return recordGrade(current, answer, {
        status: isCorrect ? "correct" : "incorrect",
        score: isCorrect ? 1 : 0,
        feedback: current.explanation,
        missingPoints: isCorrect ? [] : [current.referenceAnswer],
      });
    }
    if (!sourceAvailable) return setError(t("error.reuploadForGrading"));
    setLoading(true);
    try {
      const form = new FormData();
      form.set("question", JSON.stringify(current));
      form.set("answer", answer);
      // The question itself is the retrieval query, so only memories about this topic ride
      // along. An empty result sends no field at all rather than an empty one.
      const memoryContext = buildMemoryContext(memories, `${current.prompt} ${current.sourceNote}`);
      if (memoryContext) form.set("memory", memoryContext);
      attachSource(form);
      const response = await postForm("/api/grade-answer", form, {
        timeoutMessage: t("error.gradeTimeout"),
      });
      const grade = (await response.json()) as GradeResult & { error?: string };
      if (!response.ok) throw new Error(grade.error || t("error.gradeFailed"));
      recordUsage(
        (grade as unknown as { usage?: { inputTokens: number; outputTokens: number } }).usage,
      );
      recordGrade(current, answer, grade);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error.gradeFailed"));
    } finally {
      setLoading(false);
    }
  };

  const persistSession = (nextQuiz = quiz, nextAnswers = answers, nextGrades = grades) => {
    if (!nextQuiz || !sessionId) return;
    setSessions((old) => {
      const previous = old.find((item) => item.id === sessionId);
      const chatByQuestion = current
        ? { ...(previous?.chat || {}), [current.id]: chat }
        : previous?.chat || {};
      const updated = addSession(old, {
        id: sessionId,
        title: nextQuiz.title,
        createdAt: previous?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        questions: nextQuiz.questions,
        answers: nextAnswers,
        grades: nextGrades,
        chat: chatByQuestion,
        source,
      });
      safeStorageSet(STUDY_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const next = () => {
    if (!quiz) return;
    persistSession();
    if (index === quiz.questions.length - 1) return setView("results");
    setIndex((value) => value + 1);
    setAnswer("");
    setSubmitted(false);
    setChat([]);
  };

  const ask = async () => {
    if (!current || !chatInput.trim()) return;
    const message = chatInput.trim();
    setChat((items) => [...items, { role: "user", content: message }]);
    setChatInput("");
    setChatting(true);
    // Capture before the request, not after: what the student said is worth keeping whether
    // or not the tutor answers, and a message matching no rule leaves the book untouched.
    setMemories((previous) => {
      const next = captureMemory(previous, message);
      if (next !== previous) safeStorageSet(LEARNER_MEMORY_KEY, JSON.stringify(next));
      return next;
    });
    try {
      const form = new FormData();
      form.set("question", JSON.stringify(current));
      form.set("message", message);
      form.set("history", JSON.stringify(chat));
      attachSource(form);
      const response = await postForm("/api/question-chat", form, {
        timeoutMessage: t("error.tutorTimeout"),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) throw new Error(data.error || t("error.tutorFailed"));
      setChat((items) => [...items, { role: "assistant", content: data.reply! }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error.tutorFailed"));
    } finally {
      setChatting(false);
    }
  };

  /** Opens a standalone review quiz that is never written back over a saved session. */
  const startReviewQuiz = (title: string, questions: Question[], restored: PersistedSource) => {
    setQuiz({ title, summary: "", questions });
    setSessionId("");
    setFiles([]);
    setSourceFileId(restored.fileId);
    setSourceFileIds(restored.fileIds || (restored.fileId ? [restored.fileId] : []));
    setTranscript(restored.transcript);
    setMaterial({
      materialId: restored.materialId,
      materialName: restored.materialName,
    });
    setIndex(0);
    setAnswer("");
    setAnswers({});
    setGrades({});
    setSubmitted(false);
    setChat([]);
    setError("");
    setView("quiz");
  };

  const practiceMistakes = (entries = mistakes) => {
    if (!entries.length) return;
    startReviewQuiz(
      t("workspace.mistakeBookReview"),
      // Entries come from different quizzes that each numbered questions from q1, so the
      // per-entry key becomes the question id here to keep answers and grades separate.
      entries.map((item) => ({ ...item.question, id: item.id })),
      entries.find((item) => hasSource(item.source))?.source || EMPTY_SOURCE,
    );
  };

  const openSession = (session: StudySession) => {
    const first = session.questions[0];
    setQuiz({ title: session.title, summary: "", questions: session.questions });
    setSessionId(session.id);
    setFiles([]);
    setSourceFileId(session.source.fileId);
    setSourceFileIds(
      session.source.fileIds || (session.source.fileId ? [session.source.fileId] : []),
    );
    setTranscript(session.source.transcript);
    setMaterial({
      materialId: session.source.materialId,
      materialName: session.source.materialName,
    });
    setAnswers(session.answers);
    setGrades(session.grades);
    setIndex(0);
    setAnswer(first ? session.answers[first.id] || "" : "");
    setChat(first ? session.chat[first.id] || [] : []);
    setSubmitted(Boolean(first && session.grades[first.id]));
    setError("");
    setView("quiz");
  };

  const reset = () => {
    setView("upload");
    setFiles([]);
    setTranscript("");
    setSourceFileId(null);
    setSourceFileIds([]);
    setMaterial({ materialId: "", materialName: "" });
    setQuiz(null);
    setSessionId("");
    setAnswer("");
    setAnswers({});
    setGrades({});
    setSubmitted(false);
    setChat([]);
    setError("");
    setShareStatus("");
    setShareUrl("");
  };

  const shareChallenge = async () => {
    if (!quiz) return;
    if (!user) {
      setShareStatus(t("share.signInFirst"));
      return;
    }
    setShareStatus(t("share.creatingChallenge"));
    try {
      const created = await createSharedChallenge(getSupabaseBrowserClient(), quiz, {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const url = getChallengeShareUrl(window.location.origin, created.slug);
      setShareUrl(url);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      setShareStatus(t("share.challengeCopied"));
    } catch (cause) {
      setShareStatus(cause instanceof Error ? cause.message : t("share.challengeFailed"));
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus(t("share.challengeCopiedShort"));
    } else {
      setShareStatus(t("share.copyManually"));
    }
  };

  /**
   * Assigns a course to a material. Written straight to storage and announced, so the
   * sidebar picks it up, and left for the sync hook to upload on its next debounce.
   */
  const assignSubject = useCallback((materialId: string, subject: string) => {
    setLibrary((previous) => {
      const next = setLibrarySubject(previous, materialId, subject);
      safeStorageSet(STUDY_LIBRARY_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(STUDY_LIBRARY_UPDATED_EVENT));
      return next;
    });
  }, []);

  const openMaterial = useCallback(
    (material: { id: string; name: string; lastPracticedAt: string }) => {
      const openedAt = new Date().toISOString();
      setLibrary((previous) => {
        const existing = previous.find((item) => item.id === material.id);
        const next = upsertStudyLibrary(previous, {
          ...createLibraryRecord({
            id: material.id,
            name: material.name,
            uploadedAt: existing?.uploadedAt || material.lastPracticedAt || openedAt,
            // An existing subject wins; `upsertStudyLibrary` keeps it when this is empty.
            subject: existing?.subject,
          }),
          lastOpenedAt: openedAt,
        });
        safeStorageSet(STUDY_LIBRARY_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(STUDY_LIBRARY_UPDATED_EVENT));
        return next;
      });
      setOpenMaterialId(material.id);
      setView("material-detail");
    },
    [],
  );

  useEffect(() => {
    const handleMaterialOpen = (event: Event) => {
      const materialId = (event as CustomEvent<string>).detail;
      const selected = materials.find((item) => item.id === materialId);
      if (selected) openMaterial(selected);
    };
    window.addEventListener(STUDY_MATERIAL_OPEN_EVENT, handleMaterialOpen);
    return () => window.removeEventListener(STUDY_MATERIAL_OPEN_EVENT, handleMaterialOpen);
  }, [materials, openMaterial]);

  if (view === "transcribing" || view === "generating") return <LoadingView mode={view} />;
  if (view === "reviewing")
    return (
      <TranscriptReviewView
        transcript={transcript}
        onChange={setTranscript}
        onBack={reset}
        onGenerate={() => void generateQuiz()}
      />
    );
  if (view === "progress")
    return (
      <ProgressDashboard
        sessions={sessions}
        mistakes={mistakes}
        onBack={reset}
        onOpen={(session) => {
          setReviewSession(session);
          setView("session-review");
        }}
        onReview={practiceMistakes}
      />
    );
  if (view === "session-review" && reviewSession)
    return <ReadOnlyReview session={reviewSession} onBack={() => setView("progress")} />;
  if (view === "help") return <HelpCenter onBack={reset} />;
  if (view === "review-sheet")
    return (
      <ReviewSheetView
        entries={mistakes}
        onBack={() => setView("mistakes")}
        onPractice={practiceMistakes}
      />
    );
  if (view === "library")
    return (
      <LibraryView
        materials={materials}
        library={library}
        onAssignSubject={assignSubject}
        onBack={reset}
        onOpen={openMaterial}
      />
    );
  if (view === "material-detail") {
    const open = openMaterialId === null ? undefined : findStudyMaterial(materials, openMaterialId);
    // Its last mistake may have been cleared while the detail view was open.
    if (!open)
      return (
        <LibraryView
          materials={materials}
          library={library}
          onAssignSubject={assignSubject}
          onBack={reset}
          onOpen={openMaterial}
        />
      );
    return (
      <MaterialDetailView
        material={open}
        onBack={() => setView("library")}
        onPractice={practiceMistakes}
        onOpenSession={openSession}
        canShare={Boolean(user)}
      />
    );
  }
  if (view === "mistakes")
    return (
      <MistakeBookView
        entries={mistakes}
        onBack={reset}
        onPractice={practiceMistakes}
        onReview={() => setView("review-sheet")}
        onChange={(next) => {
          // This callback only represents a deliberate Mistake book clear/remove action.
          const removedIds = mistakes
            .filter((entry) => !next.some((nextEntry) => nextEntry.id === entry.id))
            .map((entry) => entry.id);
          setMistakes(next);
          safeStorageSet(MISTAKE_BOOK_KEY, JSON.stringify(next));
          if (removedIds.length) requestMistakeDeletion(removedIds);
        }}
      />
    );
  if (view === "quiz" && current && quiz)
    return (
      <QuizView
        quiz={quiz}
        current={current}
        index={index}
        answer={answer}
        submitted={submitted}
        grade={grades[current.id]}
        loading={loading}
        error={error}
        chat={chat}
        chatInput={chatInput}
        chatting={chatting}
        mistakeCount={mistakes.length}
        hasSourceMaterial={sourceAvailable}
        analysingOptions={analysingOptionsFor === current.id}
        onAnswerChange={setAnswer}
        onChatInputChange={setChatInput}
        onAsk={() => void ask()}
        onSubmit={() => void submit()}
        onNext={next}
        onExit={reset}
        onOpenMistakes={() => setView("mistakes")}
      />
    );
  if (view === "results" && quiz)
    return (
      <ResultsView
        quiz={quiz}
        grades={grades}
        mistakeCount={mistakes.length}
        shareStatus={shareStatus}
        shareUrl={shareUrl}
        onShare={() => void shareChallenge()}
        onCopyShare={() => void copyShareLink()}
        onOpenShare={() => undefined}
        onOpenMistakes={() => setView("mistakes")}
        onRestart={reset}
      />
    );

  return (
    <>
      <UploadView
        files={files}
        error={error}
        counts={counts}
        brief={brief}
        loading={loading}
        mistakeCount={mistakes.length}
        sessionCount={sessions.length}
        materialCount={materials.length}
        sessions={sessions}
        papers={dailyPapers}
        onAcceptFiles={acceptFiles}
        onCountsChange={setCounts}
        onBriefChange={setBrief}
        onOpenMistakes={() => setView("mistakes")}
        onOpenProgress={() => setView("progress")}
        onOpenLibrary={() => setView("library")}
        onOpenSession={openSession}
        onSitPaper={practiceMistakes}
        onStart={() => {
          if (files.length === 1 && isAudio(files[0])) void transcribe();
          else void generateQuiz();
        }}
      />
    </>
  );
}
