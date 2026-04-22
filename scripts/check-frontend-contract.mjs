import { readFileSync } from "node:fs";

const pageSource = readFileSync("app/page.tsx", "utf8");
const supabaseClientSource = readFileSync("lib/supabaseClient.ts", "utf8");
const fileUploadSource = readFileSync("components/FileUploadButton.tsx", "utf8");
const nextConfigSource = readFileSync("next.config.ts", "utf8");

const fixtures = [
  {
    name: "supabase-persists-session",
    source: supabaseClientSource,
    pattern: /persistSession:\s*true/,
  },
  {
    name: "supabase-auto-refreshes-token",
    source: supabaseClientSource,
    pattern: /autoRefreshToken:\s*true/,
  },
  {
    name: "supabase-detects-session-url",
    source: supabaseClientSource,
    pattern: /detectSessionInUrl:\s*true/,
  },
  {
    name: "supabase-uses-pkce-flow",
    source: supabaseClientSource,
    pattern: /flowType:\s*["']pkce["']/,
  },
  {
    name: "home-loads-session-before-user-refresh",
    source: pageSource,
    pattern: /supabase\.auth\.getSession\(\)[\s\S]*supabase\.auth\.getUser\(\)/,
  },
  {
    name: "home-keeps-session-fallback-on-user-refresh-failure",
    source: pageSource,
    pattern: /keeping session fallback/,
  },
  {
    name: "screenshot-has-safe-color-normalizer",
    source: pageSource,
    pattern: /screenshotSafeColor/,
  },
  {
    name: "screenshot-neutralizes-unsupported-visual-effects",
    source: pageSource,
    pattern: /background-image[\s\S]*box-shadow[\s\S]*text-shadow[\s\S]*backdrop-filter/,
  },
  {
    name: "screenshot-target-is-stable-data-attribute",
    source: pageSource,
    pattern: /data-chat-capture/,
  },
  {
    name: "tools-menu-contains-lecture-toggle",
    source: fileUploadSource,
    pattern: /Lecture Mode On[\s\S]*Lecture Mode Off/,
  },
  {
    name: "tools-menu-contains-screenshot-action",
    source: fileUploadSource,
    pattern: /Screenshot Chat/,
  },
  {
    name: "voice-input-uses-browser-speech-recognition",
    source: pageSource,
    pattern: /getSpeechRecognitionConstructor[\s\S]*webkitSpeechRecognition[\s\S]*handleVoiceInput/,
  },
  {
    name: "voice-input-has-accessible-push-to-talk-button",
    source: pageSource,
    pattern: /aria-label=\{isListening \? "Stop voice input" : "Start voice input"\}[\s\S]*Push to talk/,
  },
  {
    name: "source-cards-parse-youtube-video-ids",
    source: pageSource,
    pattern: /function\s+getYouTubeVideoId[\s\S]*searchParams\.get\(["']v["']\)/,
  },
  {
    name: "source-cards-render-youtube-thumbnails",
    source: pageSource,
    pattern: /img\.youtube\.com\/vi\/\$\{videoId\}\/mqdefault\.jpg/,
  },
  {
    name: "source-cards-deep-link-timestamp-urls",
    source: pageSource,
    pattern: /href=\{c\.timestampUrl\}[\s\S]*target="_blank"/,
  },
  {
    name: "source-cards-show-open-clip-affordance",
    source: pageSource,
    pattern: /Open clip/,
  },
  {
    name: "math-callouts-detect-efficiency-tips",
    source: pageSource,
    pattern: /function\s+getCalloutKind[\s\S]*Efficiency Tip[\s\S]*math-callout-efficiency/,
  },
  {
    name: "markdown-paragraphs-extract-nested-text-for-callouts",
    source: pageSource,
    pattern: /function\s+getNodeText[\s\S]*React\.isValidElement[\s\S]*const text = getNodeText\(children\)\.trim\(\)/,
  },
  {
    name: "math-callouts-render-with-dedicated-class",
    source: pageSource,
    pattern: /math-callout-label\s+\$\{calloutKind\}/,
  },
  {
    name: "next-allows-youtube-thumbnail-hosts",
    source: nextConfigSource,
    pattern: /hostname:\s*["']img\.youtube\.com["'][\s\S]*hostname:\s*["']i\.ytimg\.com["']/,
  },
];

let failed = false;
for (const fixture of fixtures) {
  const pass = fixture.pattern.test(fixture.source);
  if (pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
