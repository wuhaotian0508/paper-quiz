import { SharedReviewView } from "@/components/shared-review-view";

export default async function SharedReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SharedReviewView slug={slug} />;
}
