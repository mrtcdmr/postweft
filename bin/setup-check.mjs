#!/usr/bin/env node
// Shows which setup steps are done and what is still missing. Safe to run any time; it never prints secret values.
//   node bin/setup-check.mjs            files, settings, tools and installed skill copy check (no network)
//   node bin/setup-check.mjs --online   also tests account tokens and checks GitHub for newer PostWeft updates
// Exit code 0 when nothing required is missing.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, isAbsolute, dirname } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HOME } from "../lib/data-home.mjs";
import { checkPiper } from "../lib/piper.mjs";
import { resolveMusicTrack, resolveVoiceSettings } from "../lib/video.mjs";
import { findSkillCopies, checkRepoUpdate } from "../lib/updates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const online = process.argv.includes("--online");
const rows = [];
const ok = (what) => rows.push(["ok", what]);
const todo = (what, fix) => rows.push(["MISSING", what, fix]);
const maybe = (what, fix) => rows.push(["optional", what, fix]);
const warn = (what, fix) => rows.push(["update", what, fix]);
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const has = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };
const hasBin = (bin, args = ["--version"]) => spawnSync(bin, args, { stdio: "ignore", timeout: 10000 }).status === 0;

// files
const cfgFile = join(HOME, "config.json");
const cfg = readJson(cfgFile);
const hasPlatforms = Boolean(cfg && (cfg.instagram || cfg.threads || cfg.youtube || cfg.tiktok || cfg.x));
const voiceProvider = cfg?.voice?.provider || "none";
const voiceKey = { elevenlabs: "ELEVENLABS_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" }[voiceProvider];

if (!existsSync(cfgFile)) todo("config.json", `copy config/config.example.json to ${cfgFile}`);
else if (!cfg) todo("config.json", "the file is not valid JSON");
else ok("config.json");
if (!existsSync(join(HOME, "slots.json"))) {
  if (cfg && !hasPlatforms) maybe("slots.json", "not needed in content-only mode (copy config/slots.example.json when connecting a platform)");
  else todo("slots.json", `copy config/slots.example.json to ${join(HOME, "slots.json")}`);
} else ok("slots.json");
const envFile = join(HOME, ".env");
let env = {};
if (!existsSync(envFile)) {
  if (cfg && !hasPlatforms && !voiceKey) maybe(".env", "not needed yet in content-only mode (create with chmod 600 when adding tokens or API keys)");
  else todo(".env", `copy config/env.example to ${envFile} and run chmod 600 on it`);
} else {
  env = Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  if ((statSync(envFile).mode & 0o077) !== 0) todo(".env permissions", `run: chmod 600 ${envFile}`);
  else ok(".env");
}
env = { ...env, ...process.env };

if (cfg) {
  const factsFile = cfg.brand?.factsFile || "brand.md";
  const facts = isAbsolute(factsFile) ? factsFile : join(HOME, factsFile);
  if (!existsSync(facts)) todo("brand facts", `copy prompts/brand.example.md to ${facts} and describe the brand`);
  else if (/Example Coffee|replace everything/i.test(readFileSync(facts, "utf8"))) todo("brand facts", `${facts} still has the example text`);
  else ok("brand facts");

  if (!cfg.brand?.name || cfg.brand.name === "Example Coffee") todo("brand.name", "set the brand name in config.json");
  else ok(`brand: ${cfg.brand.name}, language: ${cfg.brand.language || "(not set)"}, time zone: ${cfg.timezone || "UTC"}`);
  if ((cfg.brand?.allowedLinks || []).includes("example.com")) todo("brand.allowedLinks", 'replace "example.com" with the brand\'s own domain (or [])');

  const slots = readJson(join(HOME, "slots.json"));
  if (slots && /NOT research/.test(slots._comment || "")) maybe("slots.json", "still the example times; replace them with the account's own best times when known");

  // platforms
  const ig = cfg.instagram, th = cfg.threads;
  if (!hasPlatforms) maybe("platforms", 'content-only mode (no platform connected; add "instagram", "threads", "youtube", "tiktok" or "x" to config.json when ready to publish)');
  if (ig) {
    if (!ig.userId || ig.userId === "17840000000000000") todo("instagram.userId", "set the Instagram account id (see references/setup.md)");
    else ok("instagram.userId");
    if (!env.INSTAGRAM_TOKEN) todo("INSTAGRAM_TOKEN", `the user pastes it into ${envFile} (never into the chat)`);
    else ok("INSTAGRAM_TOKEN is set");
  }
  if (th) {
    if (!env.THREADS_TOKEN) todo("THREADS_TOKEN", `the user pastes it into ${envFile} (never into the chat)`);
    else {
      const exp = readJson(join(HOME, "state/tokens.json"))?.threads?.expiresAt;
      const left = exp ? Math.floor((Date.parse(exp) - Date.now()) / 86400e3) : null;
      if (left != null && left < 0) todo("THREADS_TOKEN", "expired; create a new long-lived token");
      else if (left != null && left < 14) todo("THREADS_TOKEN", `expires in ${left} day(s); run node bin/refresh-tokens.mjs`);
      else ok(`THREADS_TOKEN is set${left != null ? ` (expires in ${left} days)` : " (add the weekly refresh-tokens cron line so it does not expire)"}`);
    }
  }

  if (cfg.youtube) {
    const k = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"].filter((x) => !env[x]);
    if (k.length) todo("YouTube app keys", `${k.join(", ")} empty in .env (or remove "youtube" from config.json)`);
    else if (!env.YOUTUBE_REFRESH_TOKEN) todo("YouTube sign-in", "run: node bin/connect.mjs youtube");
    else ok("YouTube connected");
  }
  if (cfg.tiktok) {
    const k = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"].filter((x) => !env[x]);
    if (k.length) todo("TikTok app keys", `${k.join(", ")} empty in .env (or remove "tiktok" from config.json)`);
    else if (!cfg.tiktok.redirectUri || /example\.com/.test(cfg.tiktok.redirectUri)) todo("tiktok.redirectUri", "set it to the redirect address registered in the TikTok app");
    else if (!env.TIKTOK_REFRESH_TOKEN) todo("TikTok sign-in", "run: node bin/connect.mjs tiktok");
    else ok("TikTok connected (videos go to the app as drafts)");
  }
  if (cfg.x) {
    if (!env.X_CLIENT_ID) todo("X app ID", "set X_CLIENT_ID in .env");
    else if (!cfg.x.redirectUri) todo("x.redirectUri", "set it to the exact redirect address registered in the X app");
    else if (!env.X_REFRESH_TOKEN) todo("X sign-in", "run: node bin/connect.mjs x");
    else ok("X sign-in saved");
    if (slots && !slots.x) maybe("X posting times", "add an x section to slots.json or pass --at for each post");
  }

  // media hosting (Instagram and Threads only; YouTube and TikTok upload straight from disk)
  const m = cfg.media || {};
  if (!ig && !th) { /* not needed */ }
  else if (m.mode === "dir" && (!m.dir || m.dir === "/var/www/html/media" || /example\.com/.test(m.publicBaseUrl || "")))
    todo("media hosting", "config.media still has the example folder/URL; Meta must be able to download files from a public URL");
  else if (m.mode === "command" && !m.uploadCommand) todo("media hosting", "media.uploadCommand is empty");
  else if (!["dir", "command"].includes(m.mode)) todo("media hosting", 'media.mode must be "dir" or "command"');
  else ok(`media hosting (${m.mode})`);

  // notifications
  const topic = cfg.notify?.ntfyTopic;
  if (!topic) maybe("phone notifications", "no ntfy topic: comments the AI is unsure about will only be in the logs");
  else if (topic === "pick-a-long-random-name-here") todo("notify.ntfyTopic", "still the public example name; use a long random one");
  else if (topic.length < 16) todo("notify.ntfyTopic", "too short; anyone who guesses it can read the notifications");
  else ok("phone notifications (ntfy)");

  // reply AI
  const ai = cfg.ai?.provider || "claude";
  const hasReplyPlatform = Boolean(ig || th || cfg.youtube);
  if (!hasPlatforms) maybe("reply AI", "unused in content-only mode (only needed once a platform is connected)");
  else if (!hasReplyPlatform) maybe("reply AI", "unused for the configured platform(s)");
  else {
    const bin = { claude: cfg.ai?.bin || cfg.claude?.bin || "claude", codex: cfg.ai?.bin || "codex" }[ai];
    if (bin && !has(`command -v ${bin}`)) todo(`reply AI (${ai})`, `"${bin}" is not installed or not on PATH`);
    else if (ai === "gemini" && !env.GEMINI_API_KEY) todo("reply AI (gemini)", "GEMINI_API_KEY is empty in .env");
    else if (ai === "command" && !cfg.ai?.command) todo("reply AI (command)", "ai.command is empty");
    else if (!["claude", "codex", "gemini", "command"].includes(ai)) todo("reply AI", `unknown ai.provider "${ai}"`);
    else ok(`reply AI: ${ai}`);
  }

  // voice
  const v = voiceProvider;
  const vkey = voiceKey;
  const hasVoicesMap = Object.keys(cfg.voice?.voices || {}).length > 0;
  if (vkey && !env[vkey]) todo(`voice-over (${v})`, `${vkey} is empty in .env`);
  else if (v === "elevenlabs" && !cfg.voice?.voiceId && !hasVoicesMap) todo("voice-over (elevenlabs)", "voice.voiceId is empty");
  else if (v === "piper") {
    try {
      const langs = Object.keys(cfg.voice?.voices || {});
      if (langs.length) {
        if (cfg.voice?.model) checkPiper(cfg.voice);
        for (const lang of langs) checkPiper(resolveVoiceSettings(cfg.voice, { LANG: lang }));
      } else checkPiper(cfg.voice);
      ok(`voice-over: piper${langs.length ? ` (${langs.join(", ")})` : ""}`);
    } catch (e) { todo("voice-over (piper)", e.message); }
  } else if (v === "edge-tts" && !hasBin(cfg.voice?.edgeTtsBin || "edge-tts")) todo("voice-over (edge-tts)", "install with pipx install edge-tts and make sure it is on PATH");
  else if (v === "command" && !cfg.voice?.command && !hasVoicesMap) todo("voice-over (command)", "voice.command is empty");
  else ok(`voice-over: ${v}${hasVoicesMap ? ` (${Object.keys(cfg.voice.voices).join(", ")})` : ""}`);

  // default music track (optional)
  if (cfg.video?.musicTrack) {
    try {
      resolveMusicTrack(cfg.video.musicTrack, { home: HOME });
      ok(`music track: ${cfg.video.musicTrack}`);
    } catch (e) { todo("video.musicTrack", e.message); }
  }
}

// tools
if (hasBin(process.env.FFMPEG || "ffmpeg", ["-version"])) ok("ffmpeg"); else todo("ffmpeg", "install ffmpeg (needed to build videos)");
if (existsSync(join(ROOT, "node_modules/playwright"))) ok("playwright"); else todo("playwright", "run: npm install && npx playwright install chromium");
if (has(`${process.env.PYTHON || "python3"} -c 'import faster_whisper'`)) ok("captions (faster-whisper)");
else maybe("captions", "pip install faster-whisper to add captions to videos with a voice-over");

// installed global skill copies (warn if out of date with this repo)
for (const s of findSkillCopies({ repoRoot: ROOT })) {
  if (s.status === "ok") ok(`installed skill (${s.agent}${s.linked ? ", linked" : ""})`);
  else warn(`installed skill (${s.agent})`, `${s.path} is behind repo skill/postweft (${s.changed.join(", ")}); refresh with: cp -r "${join(ROOT, "skill/postweft")}" "${dirname(s.path)}/"`);
}

// GitHub update check (--online only)
if (online) {
  const upd = await checkRepoUpdate({ repoRoot: ROOT });
  if (upd.status === "ok") ok(`PostWeft up to date (${upd.slug})`);
  else if (upd.status === "update") {
    const parts = [];
    if (upd.latestTag) parts.push(`release ${upd.latestTag}`);
    if (upd.behind) parts.push(`${upd.behind} new commit(s) on main`);
    else if (!upd.latestTag) parts.push("new commits on main");
    warn("PostWeft update", `${parts.join(", ")} at github.com/${upd.slug}; run git pull (or ask your agent to update PostWeft) and refresh any installed skill copies`);
  } else maybe("PostWeft updates", `could not check GitHub (${upd.message})`);
}

// tokens (read-only calls)
if (online && cfg) {
  const check = async (name, url, token) => {
    if (!token) return;
    try {
      const r = await fetch(url, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (j.error) todo(`${name} token`, `rejected: ${j.error.message}`);
      else ok(`${name} token works (account: ${j.username || j.id})`);
    } catch (e) { todo(`${name} token`, `could not check: ${e.message}`); }
  };
  if (cfg.instagram?.userId) await check("Instagram", `${cfg.instagram.apiBase || "https://graph.facebook.com/v23.0"}/${cfg.instagram.userId}?fields=username`, env.INSTAGRAM_TOKEN);
  if (cfg.threads) await check("Threads", `${cfg.threads.apiBase || "https://graph.threads.net/v1.0"}/me?fields=username`, env.THREADS_TOKEN);
  if (cfg.youtube && env.YOUTUBE_REFRESH_TOKEN) {
    try {
      const { yt } = await import("../lib/youtube.mjs");
      const c = (await yt("GET", "/channels", { part: "snippet", mine: "true" })).items?.[0];
      c ? ok(`YouTube sign-in works (channel: ${c.snippet.title})`) : todo("YouTube sign-in", "this Google account has no YouTube channel");
    } catch (e) { todo("YouTube sign-in", `rejected: ${e.message}; run node bin/connect.mjs youtube again`); }
  }
  if (cfg.tiktok && env.TIKTOK_REFRESH_TOKEN) {
    try { const { refreshTiktok } = await import("../lib/tiktok.mjs"); await refreshTiktok(); ok("TikTok sign-in works"); }
    catch (e) { todo("TikTok sign-in", `rejected: ${e.message}; run node bin/connect.mjs tiktok again`); }
  }
}

console.log(`data directory: ${HOME}\n`);
for (const [s, what, fix] of rows) console.log(`${s.padEnd(8)}  ${what}${fix ? "  ->  " + fix : ""}`);
const missing = rows.filter((r) => r[0] === "MISSING").length;
const updates = rows.filter((r) => r[0] === "update").length;
const updNote = updates ? ` (${updates} update notice${updates > 1 ? "s" : ""} above)` : "";
const doneMsg = cfg && !hasPlatforms
  ? `\nSetup complete (content-only mode)${updNote}. Add a platform to config.json when you are ready to publish.`
  : `\nSetup complete${updNote}.` + (online ? "" : " Run with --online to test tokens and check for updates.");
console.log(missing ? `\n${missing} thing(s) missing.` : doneMsg);
process.exit(missing ? 1 : 0);
