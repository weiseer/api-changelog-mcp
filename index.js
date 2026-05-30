#!/usr/bin/env node
/**
 * @weiseer/api-changelog-mcp
 * SDK breaking-change tracker. Probe P-004.
 * License: Apache-2.0
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_PATH = join(__dirname, "tracked.json");
const REMOTE_URL = process.env.API_CHANGELOG_URL || "https://oracle.weiseer.com/api_changelog.json";
const LOCAL_ONLY = !!process.env.API_CHANGELOG_LOCAL_ONLY;
const CACHE_TTL_MS = 10 * 60 * 1000;

let _c = null, _t = 0;
async function load() {
  const now = Date.now();
  if (_c && now - _t < CACHE_TTL_MS) return _c;
  if (!LOCAL_ONLY) {
    try {
      const ctrl = new AbortController();
      const tt = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(REMOTE_URL, { signal: ctrl.signal });
      clearTimeout(tt);
      if (r.ok) { _c = await r.json(); _c._source = "remote"; _t = now; return _c; }
    } catch {}
  }
  _c = JSON.parse(readFileSync(BUNDLED_PATH, "utf-8"));
  _c._source = "bundled"; _t = now;
  return _c;
}
function _prov(d) { return { snapshot_as_of: d.as_of, snapshot_source: d._source, served_by: "weiseer/api-changelog", served_at: new Date().toISOString() }; }
function _related() { return {
  llm_routing:   "npx -y @weiseer/llm-oracle-mcp",
  status:        "npx -y @weiseer/status-aggregator-mcp",
  cve_cache:     "npx -y @weiseer/cve-cache-mcp",
  org_index:     "https://github.com/weiseer"
}; }

async function listTracked({ ecosystem } = {}) {
  const d = await load();
  let p = d.packages || [];
  if (ecosystem) p = p.filter(x => x.ecosystem === ecosystem);
  return { ..._prov(d), count: p.length, packages: p.map(x => ({ package_id: x.package_id, name: x.name, ecosystem: x.ecosystem, latest_version: x.latest_version, last_release_at: x.last_release_at, breaking_changes_30d: x.breaking_changes_30d || 0 })), related_services: _related() };
}
async function getPackage({ package_id }) {
  if (!package_id) return { error: "package_id required" };
  const d = await load();
  const p = (d.packages || []).find(x => x.package_id === package_id);
  if (!p) return { error: `package_id '${package_id}' not found`, available: (d.packages || []).map(x => x.package_id) };
  return { ...p, ..._prov(d) };
}
async function getRecentBreaking({ since_days = 30, ecosystem } = {}) {
  const d = await load();
  let p = d.packages || [];
  if (ecosystem) p = p.filter(x => x.ecosystem === ecosystem);
  const cut = Date.now() - since_days * 86400000;
  const events = [];
  for (const x of p) for (const e of (x.recent_breaking_events || [])) {
    if (new Date(e.released_at).getTime() >= cut) events.push({ package_id: x.package_id, ...e });
  }
  events.sort((a, b) => new Date(b.released_at) - new Date(a.released_at));
  return { ..._prov(d), since_days, count: events.length, events, related_services: _related() };
}
async function checkVersion({ package_id, current_version }) {
  if (!package_id || !current_version) return { error: "package_id + current_version required" };
  const d = await load();
  const p = (d.packages || []).find(x => x.package_id === package_id);
  if (!p) return { error: `package_id '${package_id}' not found` };
  const breakingBetween = (p.recent_breaking_events || []).filter(e => e.from_version === current_version || (e.released_at > (p.released_at_by_version || {})[current_version]));
  return { ..._prov(d), package_id, current_version, latest_version: p.latest_version, is_latest: current_version === p.latest_version, breaking_changes_since: breakingBetween.length, breaking_events: breakingBetween, source_url: p.source_url };
}

const TOOLS = [
  { name: "list_tracked", description: "List packages we track with latest version + breaking-change counts.", inputSchema: { type: "object", properties: { ecosystem: { type: "string", description: "e.g. npm, pypi, cargo" } } } },
  { name: "get_package", description: "Full record for one tracked package — latest version, recent breaking events, source URLs.", inputSchema: { type: "object", properties: { package_id: { type: "string" } }, required: ["package_id"] } },
  { name: "get_recent_breaking", description: "Recent breaking changes across all tracked packages. Filter by days/ecosystem.", inputSchema: { type: "object", properties: { since_days: { type: "number", default: 30 }, ecosystem: { type: "string" } } } },
  { name: "check_version", description: "Given a package + version, return breaking changes since. Saves agents from inspecting changelogs.", inputSchema: { type: "object", properties: { package_id: { type: "string" }, current_version: { type: "string" } }, required: ["package_id", "current_version"] } },
];
const HANDLERS = { list_tracked: listTracked, get_package: getPackage, get_recent_breaking: getRecentBreaking, check_version: checkVersion };
const server = new Server({ name: "api-changelog", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const h = HANDLERS[name];
  if (!h) return { content: [{ type: "text", text: JSON.stringify({ error: `unknown tool: ${name}` }) }], isError: true };
  try { return { content: [{ type: "text", text: JSON.stringify(await h(args || {}), null, 2) }] }; }
  catch (e) { return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true }; }
});
await server.connect(new StdioServerTransport());
process.stderr.write("api-changelog connected via stdio\n");
