const localOllamaUrl = process.env.LOCAL_OLLAMA_URL || "http://127.0.0.1:11434";
const ngrokApiUrl = process.env.NGROK_API_URL || "http://127.0.0.1:4040/api/tunnels";

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function tunnelTarget(tunnel) {
  return tunnel?.config?.addr || tunnel?.config?.inspect || "unknown target";
}

function formatTunnel(tunnel) {
  return `${tunnel.public_url || "no public URL"} -> ${tunnelTarget(tunnel)}`;
}

async function main() {
  const localBase = normalizeBaseUrl(localOllamaUrl);
  console.log(`Checking local Ollama at ${localBase}`);

  let local;
  try {
    local = await fetchJson(`${localBase}/api/tags`);
  } catch (error) {
    throw new Error(
      `Local Ollama is not reachable at ${localBase}. Start Ollama first, then verify ${localBase}/api/tags. ${error instanceof Error ? error.message : ""}`.trim()
    );
  }

  if (!local.response.ok) {
    throw new Error(`Local Ollama returned HTTP ${local.response.status} at ${localBase}/api/tags.`);
  }

  const localModels = Array.isArray(local.body?.models)
    ? local.body.models.map((model) => model.name).filter(Boolean)
    : [];
  console.log(`Local Ollama OK. Models: ${localModels.join(", ") || "none listed"}`);

  let ngrok;
  try {
    ngrok = await fetchJson(ngrokApiUrl);
  } catch (error) {
    throw new Error(
      `ngrok API is not reachable at ${ngrokApiUrl}. Start ngrok with: ngrok http 11434. ${error instanceof Error ? error.message : ""}`.trim()
    );
  }

  const tunnels = Array.isArray(ngrok.body?.tunnels) ? ngrok.body.tunnels : [];
  if (tunnels.length === 0) {
    throw new Error("ngrok is running but has no active tunnels. Start one with: ngrok http 11434");
  }

  const ollamaTunnel = tunnels.find((tunnel) => /11434\b/.test(tunnelTarget(tunnel)));
  if (!ollamaTunnel?.public_url) {
    const active = tunnels.map(formatTunnel).join("\n  ");
    throw new Error(
      `No ngrok tunnel points to Ollama port 11434. Active tunnels:\n  ${active}\n\nStart or replace the tunnel with:\n  ngrok http 11434\n\nThen set Vercel OLLAMA_API_URL to that HTTPS public URL and redeploy.`
    );
  }

  const publicBase = normalizeBaseUrl(ollamaTunnel.public_url);
  console.log(`Ollama ngrok tunnel found: ${publicBase} -> ${tunnelTarget(ollamaTunnel)}`);

  let publicCheck;
  try {
    publicCheck = await fetchJson(`${publicBase}/api/tags`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
  } catch (error) {
    throw new Error(
      `The ngrok URL exists but Vercel-style access failed at ${publicBase}/api/tags. ${error instanceof Error ? error.message : ""}`.trim()
    );
  }

  if (!publicCheck.response.ok) {
    throw new Error(`The ngrok URL returned HTTP ${publicCheck.response.status} at ${publicBase}/api/tags.`);
  }

  const publicModels = Array.isArray(publicCheck.body?.models)
    ? publicCheck.body.models.map((model) => model.name).filter(Boolean)
    : [];
  console.log(`Public Ollama tunnel OK. Models: ${publicModels.join(", ") || "none listed"}`);
  console.log("");
  console.log("Set this in Vercel, then redeploy:");
  console.log(`OLLAMA_API_URL=${publicBase}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
