import { QuizWorkspace } from "@/components/quiz-workspace";
import { ProductHelpChat } from "@/components/product-help-chat";
import { DashboardNavigation } from "@/components/dashboard-navigation";

type HomeProps = {
  searchParams?: Promise<{ authError?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { authError } = (await searchParams) ?? {};

  return (
    <main className="app-shell">
      <DashboardNavigation authError={authError === "callback"} />
      <section className="app-content">
        <QuizWorkspace />
        <ProductHelpChat />
        <footer className="site-footer">
          <span>Made for the night-before-the-exam mood.</span>
          <span>Study material is used only for this generation.</span>
        </footer>
      </section>
    </main>
  );
}
