import { QuizWorkspace } from "@/components/quiz-workspace";

export default function Home() {
  return (
    <main className="page-frame">
      <nav className="site-nav" aria-label="Main navigation">
        <div className="brand-mark">
          <span>*</span> Paper Plane Quiz
        </div>
        <div className="nav-note">
          <a className="mistake-nav-link" href="#progress">
            Calendar
          </a>{" "}
          -{" "}
          <a className="mistake-nav-link" href="#mistake-book">
            Mistake book
          </a>{" "}
          -{" "}
          <a
            className="mistake-nav-link"
            href="mailto:haotianwu123%40berkeley.edu?subject=Paper%20Plane%20Quiz%20feedback&body=What%20were%20you%20doing%3F%0A%0AWhat%20went%20wrong%20or%20could%20be%20better%3F%0A%0APage%20URL%3A%20"
          >
            Feedback
          </a>
        </div>
      </nav>
      <QuizWorkspace />
      <footer className="site-footer">
        <span>Made for the night-before-the-exam mood.</span>
        <span>Study material is used only for this generation.</span>
      </footer>
    </main>
  );
}
