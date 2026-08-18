import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // Clear-cookie failure must not disclose Auth internals.
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
