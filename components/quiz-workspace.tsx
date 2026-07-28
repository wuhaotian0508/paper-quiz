"use client";

import { useEffect, useState } from "react";
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
  MISTAKE_BOOK_KEY,
  readMistakes,
  type MistakeBookEntry,
} from "@/lib/mistake-book";
import {
  addSession,
  boundSource,
  EMPTY_SOURCE,
  hasSource,
  readSessions,
  STUDY_HISTORY_KEY,
  type PersistedSource,
  type StudySession,
} from "@/lib/study-history";
import { ProgressDashboard } from "@/components/progress-dashboard";
import { ReadOnlyReview } from "@/components/read-only-review";
import { MistakeBookView } from "@/components/mistake-book-view";
import { HistoryView } from "@/components/history-view";
import { LoadingView } from "@/components/loading-view";
import { ResultsView } from "@/components/results-view";
import { TranscriptReviewView } from "@/components/transcript-review-view";
import { UploadView, fixedTypes, type CustomDraft } from "@/components/upload-view";
import { QuizView, type ChatMessage } from "@/components/quiz-view";
import { safeStorageSet } from "@/lib/request-validation";
import { postForm } from "@/lib/api-client";
import { isAudio, isPdf, MAX_STUDY_FILE_BYTES } from "@/lib/study-file";

type View =
  | "upload"
  | "transcribing"
  | "reviewing"
  | "generating"
  | "quiz"
  | "results"
  | "mistakes"
  | "history"
  | "progress"
  | "session-review";

export function QuizWorkspace() {
  const [view, setView] = useState<View>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  /** Provider file id for the uploaded PDF, so grading never re-sends the document. */
  const [sourceFileId, setSourceFileId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [counts, setCounts] = useState<Record<string, number>>({
    multiple_choice: 5,
    fill_blank: 0,
    short_answer: 0,
  });
  const [custom, setCustom] = useState<CustomDraft[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, GradeResult>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mistakes, setMistakes] = useState<MistakeBookEntry[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [reviewSession, setReviewSession] = useState<StudySession | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);

  useEffect(() => {
    setMistakes(readMistakes(window.localStorage.getItem(MISTAKE_BOOK_KEY)));
    setSessions(readSessions(window.localStorage.getItem(STUDY_HISTORY_KEY)));
  }, []);
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#mistake-book") setView("mistakes");
      if (window.location.hash === "#progress") setView("progress");
    };
    window.addEventListener("hashchange", openFromHash);
    openFromHash();
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const current = quiz?.questions[index];
  /** What grading and tutor chat send as study material, whether live or restored. */
  const source: PersistedSource = boundSource({ fileId: sourceFileId, transcript });
  const sourceAvailable = hasSource(source) || Boolean(file);

  const attachSource = (form: FormData) => {
    if (sourceFileId) form.set("fileId", sourceFileId);
    else if (transcript) form.set("transcript", transcript);
    else if (file) form.set("file", file);
  };

  const saveMistake = (question: Question, userAnswer: string, grade: GradeResult) => {
    if (grade.status === "correct") return;
    setMistakes((previous) => {
      const next = addMistake(previous, question, userAnswer, grade, source);
      safeStorageSet(MISTAKE_BOOK_KEY, JSON.stringify(next));
      return next;
    });
  };

  const recordGrade = (question: Question, userAnswer: string, grade: GradeResult) => {
    setAnswers((old) => ({ ...old, [question.id]: userAnswer }));
    setGrades((old) => ({ ...old, [question.id]: grade }));
    saveMistake(question, userAnswer, grade);
    setSubmitted(true);
  };

  const acceptFile = (next?: File) => {
    if (!next) return;
    if (!isPdf(next) && !isAudio(next))
      return setError("Choose a PDF, MP3, M4A, WAV, WebM, or MP4 study file.");
    if (next.size > MAX_STUDY_FILE_BYTES) return setError("Study files must be 20 MB or smaller.");
    setError("");
    setSourceFileId(null);
    setFile(next);
  };

  const config = (): QuestionConfiguration[] => [
    ...fixedTypes
      .map(([type]) => ({ type, count: counts[type] || 0 }) as QuestionConfiguration)
      .filter((item) => item.count > 0),
    ...custom
      .filter((item) => item.count > 0)
      .map((item) => ({
        type: "custom" as const,
        count: item.count,
        label: item.label.trim(),
        instructions: item.instructions.trim(),
      })),
  ];

  const generateQuiz = async () => {
    const questions = config();
    const total = questions.reduce((sum, item) => sum + item.count, 0);
    if (!file && !transcript.trim())
      return setError("Choose a study file or review a transcript first.");
    if (!questions.length || total < 1) return setError("Choose at least one question.");
    if (total > 15) return setError("Choose 15 questions or fewer.");
    if (questions.some((item) => item.type === "custom" && (!item.label || !item.instructions)))
      return setError("Give every custom question type a name and requirements.");
    setError("");
    setLoading(true);
    setView("generating");
    const form = new FormData();
    if (transcript.trim()) form.set("transcript", transcript.trim());
    else if (file) form.set("file", file);
    form.set("questions", JSON.stringify(questions));
    form.set("difficulty", difficulty);
    form.set("count", String(total));
    try {
      const response = await postForm("/api/generate-quiz", form, {
        timeoutMessage:
          "Quiz generation ran past the 60 second limit. Try fewer questions or a shorter lecture.",
      });
      const data = await readQuizResponse(response);
      if (!response.ok) throw new Error("error" in data ? data.error : "Quiz generation failed.");
      const generated = data as GeneratedQuiz;
      setSourceFileId(generated.sourceFileId ?? null);
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
      setView("quiz");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Quiz generation failed.");
      setView("upload");
    } finally {
      setLoading(false);
    }
  };

  const transcribe = async () => {
    if (!file) return;
    setView("transcribing");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await postForm("/api/transcribe", form, {
        timeoutMessage:
          "Transcription ran past the 60 second limit. Try a shorter or smaller recording.",
      });
      const data = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !data.transcript)
        throw new Error(data.error || "Audio transcription failed.");
      setTranscript(data.transcript);
      setView("reviewing");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audio transcription failed.");
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
    if (!sourceAvailable)
      return setError("Upload the same study file again before grading this written question.");
    setLoading(true);
    try {
      const form = new FormData();
      form.set("question", JSON.stringify(current));
      form.set("answer", answer);
      attachSource(form);
      const response = await postForm("/api/grade-answer", form, {
        timeoutMessage: "Grading ran past the 60 second limit. Please try again.",
      });
      const grade = (await response.json()) as GradeResult & { error?: string };
      if (!response.ok) throw new Error(grade.error || "Answer grading failed.");
      recordGrade(current, answer, grade);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Answer grading failed.");
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
    try {
      const form = new FormData();
      form.set("question", JSON.stringify(current));
      form.set("message", message);
      form.set("history", JSON.stringify(chat));
      attachSource(form);
      const response = await postForm("/api/question-chat", form, {
        timeoutMessage: "The tutor ran past the 60 second limit. Please try a shorter question.",
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) throw new Error(data.error || "Tutor chat failed.");
      setChat((items) => [...items, { role: "assistant", content: data.reply! }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tutor chat failed.");
    } finally {
      setChatting(false);
    }
  };

  /** Opens a standalone review quiz that is never written back over a saved session. */
  const startReviewQuiz = (title: string, questions: Question[], restored: PersistedSource) => {
    setQuiz({ title, summary: "", questions });
    setSessionId("");
    setFile(null);
    setSourceFileId(restored.fileId);
    setTranscript(restored.transcript);
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
      "Mistake book review",
      entries.map((item) => item.question),
      entries.find((item) => hasSource(item.source))?.source || EMPTY_SOURCE,
    );
  };

  const openSession = (session: StudySession) => {
    const first = session.questions[0];
    setQuiz({ title: session.title, summary: "", questions: session.questions });
    setSessionId(session.id);
    setFile(null);
    setSourceFileId(session.source.fileId);
    setTranscript(session.source.transcript);
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
    setFile(null);
    setTranscript("");
    setSourceFileId(null);
    setQuiz(null);
    setSessionId("");
    setAnswer("");
    setAnswers({});
    setGrades({});
    setSubmitted(false);
    setChat([]);
    setError("");
  };

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
        onBack={reset}
        onOpen={(session) => {
          setReviewSession(session);
          setView("session-review");
        }}
      />
    );
  if (view === "session-review" && reviewSession)
    return <ReadOnlyReview session={reviewSession} onBack={() => setView("progress")} />;
  if (view === "history")
    return <HistoryView sessions={sessions} onBack={reset} onOpen={openSession} />;
  if (view === "mistakes")
    return (
      <MistakeBookView
        entries={mistakes}
        onBack={reset}
        onPractice={practiceMistakes}
        onChange={(next) => {
          setMistakes(next);
          safeStorageSet(MISTAKE_BOOK_KEY, JSON.stringify(next));
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
        onOpenMistakes={() => setView("mistakes")}
        onRestart={reset}
      />
    );

  return (
    <UploadView
      file={file}
      error={error}
      counts={counts}
      custom={custom}
      difficulty={difficulty}
      loading={loading}
      mistakeCount={mistakes.length}
      sessionCount={sessions.length}
      onAcceptFile={acceptFile}
      onCountsChange={setCounts}
      onCustomChange={setCustom}
      onDifficultyChange={setDifficulty}
      onOpenMistakes={() => setView("mistakes")}
      onOpenProgress={() => setView("progress")}
      onOpenHistory={() => setView("history")}
      onStart={() => {
        if (file && isAudio(file)) void transcribe();
        else void generateQuiz();
      }}
    />
  );
}
