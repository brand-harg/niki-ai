import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const PLAYLISTS = [
  {
    course: "Calculus 1",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5idQ01Uwy8NR-lktj9XLDhj",
  },
  {
    course: "PreCalc1",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5gBg26H8J-wr5ZVZG7fccwu",
  },
  {
    course: "Calculus 2",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5g4blB_syg_fvfXNa8buJ-S",
  },
  {
    course: "Calculus 3",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5itj3Vezj7jKuT21_XE1gfB",
  },
  {
    course: "Statistics",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5iE1_WcjzfchtRoQVqOD6uo",
  },
  {
    course: "Differential Equations",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5gvYQp7hzFBGIH90sDlutJV",
  },
  {
    course: "Elementary Algebra",
    url: "https://youtube.com/playlist?list=PLZ8IT-A6JQ5iam0NyYkP5QP7B0gasaRlV",
  },
];

const MANUAL_URL_OVERRIDES = new Map(
  [
    [
      "Calculus 1|Nemanja Nikitovic Live Stream Calculus1 4.7 LHopitals Rule",
      "https://www.youtube.com/watch?v=3JDmyZzknVE",
    ],
    [
      "Calculus 1|Nemanja Nikitovic Live Stream Calculus1 5.5 Usub",
      "https://www.youtube.com/watch?v=-ZiS6d7pZ9c",
    ],
    [
      "Calculus 1|Nemanja Nikitovic Live Stream Calculus1 5.5 uSubtitution",
      "https://www.youtube.com/watch?v=PH9KN3gc6E8",
    ],
    [
      "Calculus 1|Nemanja Nikitovic Live Stream Calculus1s 4.8 Newtons Method",
      "https://www.youtube.com/watch?v=NT0-cskemPs",
    ],
    [
      "Calculus 3|Nemanja Nikitovic Live Stream Calculus3 14.1 VectorValued Functions",
      "https://www.youtube.com/watch?v=SJ9zO_VCe1o",
    ],
    [
      "Calculus 3|Nemanja Nikitovic Live Stream Calculus3 15.7 MinMax Problems",
      "https://www.youtube.com/watch?v=c2PpsojqH9o",
    ],
    [
      "Statistics|Nemanja Nikitovic Live Stream Statistics1 9.2 CriticalValue Approach",
      "https://www.youtube.com/watch?v=0XHyQ5oeT1U",
    ],
    [
      "Statistics|Nemanja Nikitovic Live Stream Statistics1 9.3 pvalue Approach",
      "https://www.youtube.com/watch?v=1O05Wxaz52A",
    ],
    [
      "Differential Equations|Nemanja Nikitovic Live Stream DifEq 1.5 Linear FirstOrder Equations",
      "https://www.youtube.com/watch?v=eqUT6oRxrnk",
    ],
    [
      "Differential Equations|Nemanja Nikitovic Live Stream DifEq 2.3 AccelerationVelocity Models",
      "https://www.youtube.com/watch?v=orMB1_aFceU",
    ],
  ].map(([key, url]) => [normalizeOverrideKey(key), url])
);

function normalizeOverrideKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function loadDotEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return;

  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
Usage:
  npm run rag:sync-youtube-urls
  npm run rag:sync-youtube-urls -- --apply

Options:
  --apply              Update Supabase. Omit this for a dry run.
  --minScore <number>  Minimum title-match score. Default: 0.72.
  --report <path>      Report output path. Default: scripts/youtube-url-sync-report.json.

Notes:
  The script uses yt-dlp when available. If it is not installed, it falls back to
  parsing the public YouTube playlist page.
`);
    process.exit(0);
  }

  const getValue = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      return fallback;
    }
    return argv[index + 1];
  };

  return {
    apply: argv.includes("--apply"),
    minScore: Number(getValue("--minScore", 0.72)),
    report: getValue("--report", "scripts/youtube-url-sync-report.json"),
  };
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/\b(nemanja|nikitovic|live|stream|calculus|calc|statistics|differential|equations|elementary|algebra|spring|fall|summer|winter|lecture|class)\b/g, " ")
    .replace(/\b\d{4}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return normalizeTitle(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function titleScore(sourceTitle, videoTitle) {
  const sourceTokens = tokens(sourceTitle);
  const videoTokens = tokens(videoTitle);
  if (!sourceTokens.length || !videoTokens.length) return 0;

  const videoSet = new Set(videoTokens);
  const overlap = sourceTokens.filter((token) => videoSet.has(token)).length;
  const coverage = overlap / sourceTokens.length;
  const reverseCoverage = overlap / videoTokens.length;

  return coverage * 0.7 + reverseCoverage * 0.3;
}

function usableUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function findPlaylistVideoRenderers(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (value.playlistVideoRenderer?.videoId) {
    out.push(value.playlistVideoRenderer);
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) findPlaylistVideoRenderers(item, out);
    } else if (child && typeof child === "object") {
      findPlaylistVideoRenderers(child, out);
    }
  }
  return out;
}

function textFromRuns(value) {
  return (
    value?.simpleText ||
    value?.runs?.map((run) => run.text).join("") ||
    ""
  ).trim();
}

async function fetchPlaylistFromPage(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`YouTube page fetch failed: ${res.status}`);
  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!match) throw new Error("Could not find ytInitialData in YouTube playlist page.");
  const data = JSON.parse(match[1]);
  const seen = new Set();
  return findPlaylistVideoRenderers(data)
    .map((item, index) => ({
      index,
      title: textFromRuns(item.title),
      videoId: item.videoId,
      url: usableUrl(item.videoId),
    }))
    .filter((item) => {
      if (!item.videoId || !item.title || seen.has(item.videoId)) return false;
      seen.add(item.videoId);
      return true;
    });
}

function tryRunYtDlp(url) {
  const commands = [
    ["yt-dlp", ["--flat-playlist", "--dump-json", url]],
    ["python", ["-m", "yt_dlp", "--flat-playlist", "--dump-json", url]],
    ["py", ["-m", "yt_dlp", "--flat-playlist", "--dump-json", url]],
  ];

  for (const [command, args] of commands) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
      shell: false,
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((item) => item?.id && item?.title)
        .map((item, index) => ({
          index,
          title: item.title,
          videoId: item.id,
          url: usableUrl(item.id),
        }));
    }
  }

  return null;
}

async function getPlaylistVideos(url) {
  const ytDlpVideos = tryRunYtDlp(url);
  if (ytDlpVideos?.length) return { videos: ytDlpVideos, source: "yt-dlp" };
  const pageVideos = await fetchPlaylistFromPage(url);
  return { videos: pageVideos, source: "youtube-page" };
}

async function main() {
  loadDotEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report = {
    applied: args.apply,
    minScore: args.minScore,
    courses: [],
  };

  for (const playlist of PLAYLISTS) {
    console.log(`\n${playlist.course}: reading playlist...`);
    const { videos, source } = await getPlaylistVideos(playlist.url);
    console.log(`  Found ${videos.length} playlist videos via ${source}.`);

    const { data, error } = await supabase
      .from("lecture_sources")
      .select("id, lecture_title, course, video_url")
      .ilike("course", `%${playlist.course}%`)
      .order("lecture_title", { ascending: true });

    if (error) throw new Error(error.message);

    const sources = data ?? [];
    const usedVideoIds = new Set();
    const matches = [];
    const review = [];

    for (const source of sources) {
      const overrideUrl = MANUAL_URL_OVERRIDES.get(
        normalizeOverrideKey(`${playlist.course}|${source.lecture_title}`)
      );
      const overrideVideo = overrideUrl
        ? videos.find((video) => video.url === overrideUrl)
        : null;

      if (overrideUrl && (!overrideVideo || !usedVideoIds.has(overrideVideo.videoId))) {
        if (overrideVideo) usedVideoIds.add(overrideVideo.videoId);
        matches.push({
          source,
          video: overrideVideo ?? {
            index: -1,
            title: "Manual override",
            videoId: new URL(overrideUrl).searchParams.get("v") ?? overrideUrl,
            url: overrideUrl,
          },
          score: 1,
          manual: true,
        });
        continue;
      }

      const ranked = videos
        .filter((video) => !usedVideoIds.has(video.videoId))
        .map((video) => ({
          source,
          video,
          score: titleScore(source.lecture_title, video.title),
        }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (best && best.score >= args.minScore) {
        usedVideoIds.add(best.video.videoId);
        matches.push(best);
      } else {
        review.push({
          sourceId: source.id,
          lectureTitle: source.lecture_title,
          existingUrl: source.video_url,
          bestCandidate: best
            ? {
              title: best.video.title,
              url: best.video.url,
              score: Number(best.score.toFixed(3)),
            }
            : null,
        });
      }
    }

    if (args.apply) {
      for (const match of matches) {
        const { error: updateError } = await supabase
          .from("lecture_sources")
          .update({ video_url: match.video.url })
          .eq("id", match.source.id);
        if (updateError) throw new Error(updateError.message);
      }
    }

    const unusedVideos = videos
      .filter((video) => !usedVideoIds.has(video.videoId))
      .map((video) => ({
        title: video.title,
        url: video.url,
      }));

    report.courses.push({
      course: playlist.course,
      sourceCount: sources.length,
      playlistVideoCount: videos.length,
      matchedCount: matches.length,
      reviewCount: review.length,
      unusedVideoCount: unusedVideos.length,
      review,
      unusedVideos,
    });

    console.log(
      `  ${args.apply ? "Updated" : "Would update"} ${matches.length}/${sources.length}; ${review.length} need review; ${unusedVideos.length} playlist videos unused.`
    );
  }

  writeFileSync(args.report, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${args.report}`);
  if (!args.apply) console.log("Dry run only. Re-run with --apply to update Supabase.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${message}`);
  process.exit(1);
});
