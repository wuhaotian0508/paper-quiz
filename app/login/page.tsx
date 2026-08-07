import { LoginView } from "@/components/login-view";
import { LoginFeatures, LoginStory } from "@/components/login-story";

type LoginPageProps = {
  searchParams?: Promise<{ authError?: string; returnTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { authError, returnTo } = (await searchParams) ?? {};

  return (
    <main className="login-page">
      <section className="login-card">
        <LoginStory />
        <LoginView authError={authError === "callback"} returnTo={returnTo} />
      </section>
      <LoginFeatures />
    </main>
  );
}
