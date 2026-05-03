"use client";

import NemanjaRoadmap from "@/components/NemanjaRoadmap";

type RoadmapModalProps = {
  isOpen: boolean;
  accentColor: string;
  onClose: () => void;
  onOpenTopicInChat: (payload: {
    course: string;
    topic: string;
    prompt: string;
  }) => void;
};

export default function RoadmapModal({
  isOpen,
  accentColor,
  onClose,
  onOpenTopicInChat,
}: RoadmapModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close roadmap"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
      />
      <div className="fixed inset-x-3 top-8 z-50 mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#090909]/98 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:inset-x-8">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
              Roadmap
            </p>
            <h2 className="mt-2 truncate text-lg font-extrabold tracking-tight text-white">
              Nemanja Roadmap
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Browse the course path, then send a focused topic back to chat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4 sm:px-5">
          <NemanjaRoadmap onOpenTopicInChat={onOpenTopicInChat} />
        </div>
      </div>
    </>
  );
}
