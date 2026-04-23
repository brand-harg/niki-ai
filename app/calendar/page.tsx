"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  course: string | null;
};

const COURSE_OPTIONS = [
  "Elementary Algebra",
  "PreCalc 1",
  "Calc 1",
  "Calc 2",
  "Calc 3",
  "Differential Equations",
  "Statistics",
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatEventDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatEventTime(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function CalendarPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [time, setTime] = useState("");
  const [course, setCourse] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testEventCount = useMemo(
    () => events.filter((event) => /\b(test|exam|quiz|midterm|final)\b/i.test(event.title)).length,
    [events]
  );

  const loadEvents = async (currentUserId: string) => {
    const { data, error: loadError } = await supabase
      .from("calendar_events")
      .select("id,title,event_date,event_time,course")
      .eq("user_id", currentUserId)
      .gte("event_date", todayIsoDate())
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(30);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setEvents((data ?? []) as CalendarEvent[]);
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session?.user?.id) {
        router.replace("/login");
        return;
      }

      setUserId(session.user.id);
      await loadEvents(session.user.id);
      if (mounted) setLoading(false);
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleCreateEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!userId) {
      router.replace("/login");
      return;
    }

    if (!title.trim()) {
      setError("Event title is required.");
      return;
    }

    if (!date || !time) {
      setError("Date and time are required.");
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from("calendar_events").insert({
        user_id: userId,
        title: title.trim(),
        event_date: date,
        event_time: time,
        course: course || null,
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      setTitle("");
      setDate(todayIsoDate());
      setTime("");
      setCourse("");
      await loadEvents(userId);
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!userId) return;

    const { error: deleteError } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setEvents((prev) => prev.filter((event) => event.id !== id));
  };

  return (
    <main className="min-h-screen bg-black text-white selection:bg-cyan-500/30">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="text-2xl font-black uppercase tracking-tighter">
            Niki<span className="text-cyan-400">Ai</span>
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
          >
            Back to Chat
          </Link>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[360px_1fr]">
          <form
            onSubmit={handleCreateEvent}
            className="h-fit rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl"
          >
            <h1 className="text-xl font-black uppercase tracking-tight">Calendar</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Add tests, quizzes, deadlines, or study blocks. Niki uses upcoming events quietly when they matter.
            </p>

            <div className="mt-6 space-y-4">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Event title"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-500/50"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500/50"
                  required
                />
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500/50"
                  required
                />
              </div>
              <select
                value={course}
                onChange={(event) => setCourse(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500/50"
              >
                <option value="">Optional course</option>
                {COURSE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-2xl bg-cyan-600 py-4 text-xs font-black uppercase tracking-widest text-white transition hover:bg-cyan-500 disabled:bg-zinc-800"
            >
              {saving ? "Saving..." : "Add Event"}
            </button>
          </form>

          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Upcoming</h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                  {events.length} events · {testEventCount} assessment markers
                </p>
              </div>
            </div>

            {loading ? (
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-slate-500">
                Loading calendar...
              </div>
            ) : events.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-slate-500">
                No upcoming events yet.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {events.map((event) => (
                  <article
                    key={event.id}
                    className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {event.course && (
                          <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-300">
                            {event.course}
                          </span>
                        )}
                        {/\b(test|exam|quiz|midterm|final)\b/i.test(event.title) && (
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                            Study signal
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 break-words text-base font-extrabold text-white">
                        {event.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {formatEventDate(event.event_date)} at {formatEventTime(event.event_time)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteEvent(event.id)}
                      className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:border-red-500/40 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
