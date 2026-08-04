import { LoginView } from "@/components/login-view";

type LoginPageProps = {
  searchParams?: Promise<{ authError?: string }>;
};

function LoginStory() {
  return (
    <section className="login-story" aria-labelledby="login-story-heading">
      <div className="login-brand"><span aria-hidden="true">*</span> Paper Plane Quiz</div>
      <div className="login-story-copy">
        <p className="login-kicker">Study smarter, one quiz at a time</p>
        <h2 id="login-story-heading">
          Turn your lectures into <em>better quizzes.</em>
        </h2>
        <p>Upload your lecture materials and get practice questions that help you learn and remember more.</p>
      </div>
      <div className="login-story-art" aria-hidden="true">
        <span className="login-art-paper">PDF</span>
        <span className="login-art-wave">~ ~ ~</span>
        <span className="login-art-plane">➤</span>
        <span className="login-art-question">?</span>
      </div>
      <blockquote>
        <span aria-hidden="true">“</span>
        <p>Paper Plane Quiz helps me study smarter, not harder.</p>
        <cite>— UCB Student</cite>
      </blockquote>
    </section>
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { authError } = (await searchParams) ?? {};

  return (
    <main className="login-page">
      <section className="login-card">
        <LoginStory />
        <LoginView authError={authError === "callback"} />
      </section>
      <div className="login-features" aria-label="Product benefits">
        <span><b>Upload</b> PDFs, slides, or recordings</span>
        <span><b>Generate</b> focused practice quizzes</span>
        <span><b>Improve</b> with progress that compounds</span>
      </div>
    </main>
  );
}

