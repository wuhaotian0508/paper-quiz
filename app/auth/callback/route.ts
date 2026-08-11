import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const LOCAL_ORIGIN = "http://localhost:3000";
const PRODUCTION_ORIGIN = "https://paper-quiz-ai-amber.vercel.app";

function trustedOrigin(request: NextRequest) {
  const origin = request.nextUrl.origin;
  return origin === LOCAL_ORIGIN || origin === PRODUCTION_ORIGIN ? origin : PRODUCTION_ORIGIN;
}

function callbackErrorRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL("/login?authError=callback", trustedOrigin(request)));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return callbackErrorRedirect(request);

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return callbackErrorRedirect(request);
  } catch {
    return callbackErrorRedirect(request);
  }

  // Always the dashboard. A `returnTo` used to carry the visitor back to the shared review or
  // quiz they arrived from, which left them on a read-only page that looks identical signed in.
  // Ignoring the parameter here also covers magic links already sent with one attached.
  return NextResponse.redirect(new URL("/", trustedOrigin(request)));
}
