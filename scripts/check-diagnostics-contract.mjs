import { readFileSync } from "node:fs";

const heartbeatSource = readFileSync("scripts/heartbeat-diagnostics.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const fixtures = [
  {
    name: "heartbeat-defaults-to-60-seconds",
    pass: /DEFAULT_INTERVAL_SECONDS = 60/.test(heartbeatSource),
  },
  {
    name: "heartbeat-checks-app-health-endpoint",
    pass: /\/api\/ollama\/health/.test(heartbeatSource) && /checkAppHealth/.test(heartbeatSource),
  },
  {
    name: "heartbeat-checks-ollama-tags",
    pass: /\/api\/tags/.test(heartbeatSource) && /ngrok-skip-browser-warning/.test(heartbeatSource),
  },
  {
    name: "heartbeat-checks-ngrok-11434",
    pass: /checkNgrokTunnel/.test(heartbeatSource) && /11434/.test(heartbeatSource),
  },
  {
    name: "heartbeat-has-once-mode",
    pass: /--once/.test(heartbeatSource) && /process\.exit\(ok \? 0 : 1\)/.test(heartbeatSource),
  },
  {
    name: "package-exposes-heartbeat",
    pass: packageJson.scripts?.["diagnostics:heartbeat"] === "node scripts/heartbeat-diagnostics.mjs",
  },
];

let failed = false;
for (const fixture of fixtures) {
  if (fixture.pass) {
    console.log(`✅ ${fixture.name}`);
  } else {
    failed = true;
    console.error(`❌ ${fixture.name}`);
  }
}

if (failed) process.exit(1);
