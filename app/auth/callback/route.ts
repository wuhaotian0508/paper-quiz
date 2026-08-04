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

  return NextResponse.redirect(new URL("/", trustedOrigin(request)));
}
