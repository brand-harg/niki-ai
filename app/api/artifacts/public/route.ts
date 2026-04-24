export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
      console.error("Public artifacts fetch failed:", error);
      return NextResponse.json({ artifacts: [] }, { status: 500 });
    }

    return NextResponse.json({ artifacts: data ?? [] });
  } catch (error) {
    console.error("Public artifacts route error:", error);
    return NextResponse.json({ artifacts: [] }, { status: 500 });
  }
}
