import { balanceOf } from "@/lib/credit-ledger";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 15;

/**
 * The signed-in learner's credit balance.
 *
 * Summed from the ledger on every read rather than cached anywhere: the rows are few — one
 * per purchase — and a stored total is a second version of the truth that can disagree with
 * the first. The query is scoped by RLS, so it can only ever return the caller's own rows.
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: session } = await supabase.auth.getUser();
    if (!session.user) {
      return Response.json({ error: "Sign in to see your credit." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("paper_quiz_credit_entries")
      .select("amount_cents")
      .eq("user_id", session.user.id);
    if (error) throw new Error(error.message);

    return Response.json({ balanceCents: balanceOf(data ?? []) });
  } catch (cause) {
    console.error(
      "Credit balance could not be read",
      cause instanceof Error ? cause.message : "unknown error",
    );
    return Response.json({ error: "Your credit balance is unavailable." }, { status: 502 });
  }
}
