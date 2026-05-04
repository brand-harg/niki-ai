export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logSafeError } from "@/lib/safeLogger";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("study_artifacts")
      .select("id, title, content, source_prompt, kind, course_tag, topic_tag, is_public, created_at, updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      logSafeError("api.artifacts.public.fetch", error, { route: "/api/artifacts/public" });
      return NextResponse.json({ artifacts: [] });
    }

    return NextResponse.json({ artifacts: data ?? [] });
  } catch (error) {
    logSafeError("api.artifacts.public.route", error, { route: "/api/artifacts/public" });
    return NextResponse.json({ artifacts: [] });
  }
}
