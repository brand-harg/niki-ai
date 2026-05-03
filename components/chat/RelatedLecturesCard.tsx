"use client";

import Image from "next/image";
import {
  formatRelatedLectureTitle,
  getYouTubeVideoId,
  type ChatDisplayRelatedLecture,
} from "@/lib/chatDisplay";

type RelatedLecturesCardProps = {
  lectures: ChatDisplayRelatedLecture[];
  accentColor: string;
  accentBorder: string;
};

export default function RelatedLecturesCard({
  lectures,
  accentColor,
  accentBorder,
}: RelatedLecturesCardProps) {
  const isGreen = accentColor === "green";
  const isAmber = accentColor === "amber";
  const accentText = isGreen ? "text-green-400" : isAmber ? "text-amber-400" : "text-cyan-400";
  const visibleLectures = lectures.slice(0, 3);

  if (!visibleLectures.length) return null;

  return (
    <div className={`mt-4 rounded-2xl border ${accentBorder} bg-white/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_45px_rgba(0,0,0,0.18)]`}>
      <div className="mb-3">
        <p className={`text-[9px] font-black uppercase tracking-widest ${accentText}`}>
          Related Lectures
        </p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          These are follow-up suggestions, not sources used in this answer.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visibleLectures.map((lecture) => {
          const videoId = getYouTubeVideoId(lecture.video_url);
          return (
            <a
              key={lecture.id}
              href={lecture.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 transition hover:border-white/20 hover:bg-white/[0.035]"
            >
              {videoId && (
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                  <Image
                    src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover opacity-80 transition group-hover:scale-105 group-hover:opacity-100"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 text-[11px] font-bold leading-snug text-slate-300">
                  {formatRelatedLectureTitle(lecture.lecture_title)}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {lecture.course}
                  {lecture.professor ? ` · ${lecture.professor}` : ""}
                </p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
