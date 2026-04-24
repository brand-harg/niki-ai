export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getLectureCourseCounts } from "@/lib/ragHelpers";

export async function GET() {
  try {
    const counts = await getLectureCourseCounts();
    const indexedLectureCount = counts.reduce((sum, row) => sum + row.count, 0);
    const status = indexedLectureCount === 0 ? "Missing" : "Healthy";

    return NextResponse.json({
      indexedLectureCount,
      courseCounts: counts,
      status,
    });
  } catch (error) {
    console.error("Knowledge base status route error:", error);
    return NextResponse.json(
      {
        indexedLectureCount: 0,
        courseCounts: [],
        status: "Missing",
      },
      { status: 500 }
    );
  }
}
