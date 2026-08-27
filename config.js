// ════════════════════════════════════════════════════════════════════════════
// /config.js — the ONE place a target host is written down
// ────────────────────────────────────────────────────────────────────────────
// These tools are static files on a Caddy file-server (see Dockerfile: three
// lines, no build step, no server-side code, no environment variables reaching
// the browser). A static file cannot read an env var, so every target host has
// to be a compile-time constant somewhere. Before this file there were THREE
// somewheres — DASHBOARD_URL was hardcoded separately in e360/index.html,
// novaspec/index.html and powerspec/index.html, and they had already started to
// drift. Changing a host meant three edits and remembering all three.
//
// Every tool reads these with a FALLBACK to the value it used to hardcode:
//
//     const DASHBOARD_URL = (window.E360_TARGETS && window.E360_TARGETS.dashboard)
//                        || 'https://web-production-f9d318.up.railway.app';
//
// so if this file ever fails to load — a stale cache, a bad deploy, someone
// opening index.html straight off disk with file:// — the tools keep working
// exactly as they do today. Nothing here is required; everything here is
// preferred.
//
// Loaded as <script src="/config.js?v=1"></script> from each tool's <head>.
// The ?v= is deliberate: Caddy serves index.html with default caching and the
// deploy notes already tell operators to hard-refresh. Bump it when you change
// a value here, or the browser will keep the old host.
//
// ⚠ NOTHING SECRET GOES IN THIS FILE. It is world-readable on a public URL.
//   That is also why neither bind flow uses an API key: the tools never hold a
//   credential. They open a first-party popup on the target app, and the popup
//   — carrying the operator's own session — performs the write.
// ════════════════════════════════════════════════════════════════════════════

window.E360_TARGETS = {
  // The staffing / planner dashboard. Long-standing target of "Bind to
  // Dashboard Event"; unchanged.
  dashboard: 'https://web-production-f9d318.up.railway.app',

  // ⚠ PLACEHOLDER — Showrunner (the PM app) has no public host yet.
  //   Railway has not assigned one. Until it does, this points at a local dev
  //   server so the flow can be exercised end to end; "Bind to PM Show" will
  //   simply fail to open a popup for anyone else, which is the honest
  //   behaviour for a target that does not exist.
  //   WHEN THE REAL HOST LANDS: change this ONE line and bump the ?v= in the
  //   three <script src="/config.js?v=N"> tags.
  showrunner: 'http://localhost:3100'
};
