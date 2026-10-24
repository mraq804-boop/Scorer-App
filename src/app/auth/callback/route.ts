import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/server/supabase/server";

function destination(next: string | null, origin: string): URL {
  if (next !== null && next.startsWith("/") && !next.startsWith("//")) {
    const target = new URL(next, origin);
    if (target.origin === origin) return target;
  }
  return new URL("/account", origin);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error === null) return NextResponse.redirect(destination(searchParams.get("next"), origin));
  }
  return NextResponse.redirect(new URL("/account?error=auth", origin));
}
