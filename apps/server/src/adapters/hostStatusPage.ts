import { createHash } from "node:crypto";
import type { HostStatusSnapshot } from "./hostStatusHttp.js";

const MODE_LABELS: Record<HostStatusSnapshot["mode"], string> = {
  "dry-run": "Dry run (input is only logged)",
  emulation: "Keyboard / mouse emulation",
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function controllerText(snapshot: HostStatusSnapshot): string {
  const { connected, remoteAddress } = snapshot.controller;
  if (!connected) return "Waiting for a controller";
  return remoteAddress ? `Connected from ${remoteAddress}` : "Connected";
}

/**
 * The page's only script. It is static so the CSP can allow it by hash
 * instead of 'unsafe-inline'. Untrusted values are written with textContent.
 */
const PAGE_SCRIPT = `
(() => {
  const modes = ${JSON.stringify(MODE_LABELS).replace(/</g, "\\u003c")};
  const $ = (id) => document.getElementById(id);
  const render = (s) => {
    const list = $("addresses");
    list.replaceChildren(...(s.addresses.length ? s.addresses : ["No LAN IPv4 found (port " + s.port + ")"]).map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }));
    $("pin").textContent = s.pin;
    $("mode").textContent = modes[s.mode] || s.mode;
    const c = s.controller;
    $("dot").classList.toggle("on", c.connected);
    $("controller").textContent = c.connected
      ? (c.remoteAddress ? "Connected from " + c.remoteAddress : "Connected")
      : "Waiting for a controller";
    const p = s.pending;
    $("request").hidden = !p;
    $("request-device").textContent = p ? p.device : "";
    $("request-address").textContent = p ? p.remoteAddress : "";
    $("request-error").textContent = "";
  };
  const decide = async (path) => {
    const buttons = [$("allow"), $("deny")];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) $("request-error").textContent = response.status === 409 ? "The request is no longer pending." : "Action failed (" + response.status + ").";
    } catch {
      $("request-error").textContent = "Server unreachable.";
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  };
  $("allow").addEventListener("click", () => decide("/approve"));
  $("deny").addEventListener("click", () => decide("/deny"));
  const server = $("server");
  const events = new EventSource("/events");
  events.onopen = () => { server.textContent = "Server started"; server.classList.remove("down"); };
  events.onmessage = (event) => render(JSON.parse(event.data));
  events.onerror = () => { server.textContent = "Server unreachable"; server.classList.add("down"); };
})();
`;

/** CSP source expression that allows exactly {@link PAGE_SCRIPT}. */
export const HOST_STATUS_SCRIPT_HASH = `sha256-${createHash("sha256").update(PAGE_SCRIPT).digest("base64")}`;

/**
 * Self-contained host status page (no external assets). Initial values are
 * rendered server-side; `/events` keeps them live through EventSource.
 */
export function renderHostStatusPage(snapshot: HostStatusSnapshot): string {
  const addresses =
    snapshot.addresses.length > 0
      ? snapshot.addresses.map((address) => `<li>${escapeHtml(address)}</li>`).join("")
      : `<li class="muted">No LAN IPv4 found (port ${snapshot.port})</li>`;
  const connected = snapshot.controller.connected;
  const pending = snapshot.pending;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gamepad Host</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0f1115;
    --card: #181b22;
    --line: #262a33;
    --text: #e7e9ee;
    --muted: #8b91a0;
    --accent: #7aa2ff;
    --ok: #3ddc84;
    --off: #ff5c5c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 16px;
    background: radial-gradient(circle at 20% 0%, #1a2030 0%, var(--bg) 60%);
    color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    width: 100%;
    max-width: 380px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .head h1 { font-size: 18px; margin: 0; font-weight: 600; }
  .badge {
    margin-left: auto;
    font-size: 12px;
    color: var(--ok);
    border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent);
    border-radius: 999px;
    padding: 2px 10px;
  }
  .badge.down { color: var(--off); border-color: color-mix(in srgb, var(--off) 40%, transparent); }
  dl { margin: 0; display: grid; gap: 14px; }
  dt { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  dd { margin: 2px 0 0; }
  ul { list-style: none; margin: 0; padding: 0; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .pin { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 28px; letter-spacing: 0.2em; color: var(--accent); }
  .muted { color: var(--muted); }
  .status { display: flex; align-items: center; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--off); box-shadow: 0 0 8px var(--off); flex: none; }
  .dot.on { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  [hidden] { display: none !important; }
  .request {
    margin-bottom: 20px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 12%, var(--card));
  }
  .request h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
  .request p { margin: 0 0 12px; }
  .actions { display: flex; gap: 10px; }
  .actions button {
    flex: 1;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--line);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    color: var(--text);
    background: var(--card);
  }
  .actions button.allow { background: var(--ok); border-color: var(--ok); color: #08130c; }
  .actions button:disabled { opacity: 0.6; cursor: default; }
  .error { color: var(--off); font-size: 13px; margin: 8px 0 0; min-height: 1em; }
</style>
</head>
<body>
<main class="card">
  <div class="head">
    <h1>Gamepad Host</h1>
    <span class="badge" id="server">Server started</span>
  </div>
  <section class="request" id="request" aria-live="polite"${pending ? "" : " hidden"}>
    <h2>Connection request from <span id="request-device">${escapeHtml(pending?.device ?? "")}</span> (<span id="request-address">${escapeHtml(pending?.remoteAddress ?? "")}</span>)</h2>
    <p class="muted">Allow it to use this computer as a gamepad.</p>
    <div class="actions">
      <button type="button" class="allow" id="allow">Allow</button>
      <button type="button" id="deny">Deny</button>
    </div>
    <p class="error" id="request-error"></p>
  </section>
  <dl>
    <div><dt>Address</dt><dd><ul id="addresses">${addresses}</ul></dd></div>
    <div><dt>PIN</dt><dd class="pin" id="pin">${escapeHtml(snapshot.pin)}</dd></div>
    <div><dt>Mode</dt><dd id="mode">${escapeHtml(MODE_LABELS[snapshot.mode])}</dd></div>
    <div><dt>Gamepad</dt><dd class="status"><span class="dot${connected ? " on" : ""}" id="dot"></span><span id="controller">${escapeHtml(controllerText(snapshot))}</span></dd></div>
  </dl>
</main>
<script>${PAGE_SCRIPT}</script>
</body>
</html>
`;
}
