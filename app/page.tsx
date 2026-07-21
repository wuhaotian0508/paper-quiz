import { QuizWorkspace } from "@/components/quiz-workspace";

export default function Home() {
  return (
    <main className="page-frame">
      <nav className="site-nav" aria-label="Main navigation">
        <div className="brand-mark"><span>âœ¦</span> Paper Plane Quiz</div>
        <div className="nav-note"><a className="mistake-nav-link" href="#mistake-book">Mistake book</a> · Your pace</div>
      </nav>
      <QuizWorkspace />
      <footer className="site-footer"><span>Made for the night-before-the-exam mood.</span><span>Study material is used only for this generation.</span></footer>
    </main>
  );
}
