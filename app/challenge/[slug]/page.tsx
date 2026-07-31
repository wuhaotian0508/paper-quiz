import { SharedChallengeView } from "@/components/shared-challenge-view";

export default async function SharedChallengePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SharedChallengeView slug={slug} />;
}
