# Paper Quiz Hardening Design

## Goal

Resolve the issues listed in the supplied audit while preserving the current quiz flow and uncommitted user work.

## Scope

1. Prevent session overwrites and local-storage crashes.
2. Make mistake-book/history restores explicit about their source material and persist chat by question.
3. Validate question counts, files, transcripts, answers, questions, and chat history at every API boundary.
4. Protect public OpenAI-backed routes with a bounded rate limiter and explicit Vercel duration settings.
5. Remove dead scoring code, use `acceptedAnswers` for fill-blank grading, support drag-and-drop, and surface empty/invalid input.
6. Centralize the model setting, pin the OpenAI SDK, update ignores, add formatting/lint guardrails, and split the oversized workspace into focused view components where behavior can be preserved.
7. Reduce repeated PDF cost by introducing a bounded source-reference abstraction; if the provider cannot safely retain files, keep the current upload path but expose the tradeoff rather than silently claiming no storage.

## Design

- Shared validation helpers live in `lib/request-validation.ts`; routes return 400 for malformed user input and never parse untrusted JSON outside a schema.
- A small rate-limit helper uses an injected store. The default in-process store is only a best-effort local fallback; production configuration uses Upstash REST when its environment variables are present.
- Local persistence uses guarded read/write helpers with size-aware pruning. Session data stores chat as a per-question map and source metadata needed to explain when a restored subjective answer cannot be regraded.
- Multiple choice stays local. Fill-blank compares normalized answers against `acceptedAnswers`. Subjective/custom questions still use the grading route when source material is present.
- API routes enforce a 20 MB PDF limit, a 20 MB media limit where applicable, and bounded text fields before reading/encoding files. Vercel route duration is explicitly configured.
- The UI validates total question count before enabling generation, supports drag/drop, reports invalid counts, clears stale session ids when opening a single mistake, and handles quota errors without throwing from React state updaters.

## Verification

- Add focused unit/API/component regression tests for every repaired behavior.
- Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` after implementation.
- Review `git diff` and `git status` to ensure no unrelated user files are removed.
