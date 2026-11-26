#!/usr/bin/env node
// How did the posts do? Reads the statistics of your own recent posts (official insights APIs, read-only) and shows
// the best posts, how each format does, and which days/hours worked best, so you (or your AI agent) can plan and
// update slots.json. It never changes slots.json itself.
//   node bin/insights.mjs [--days 60] [instagram|threads|youtube] [--json]
// Needs instagram_manage_insights (Instagram) and threads_manage_insights (Threads) on the tokens; YouTube uses the
// public counts of your videos. TikTok drafts are posted by hand in the app, so there are no TikTok numbers here.
import { writeFileSync } from "node:fs";
import { config, statePath, loadState } from "../lib/config.mjs";
import { api, IG_USER } from "../lib/meta.mjs";
import { toLocal } from "../lib/time.mjs";
import { yt, recentVideos } from "../lib/youtube.mjs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const days = Number(arg("days", 60));
const only = process.argv.slice(2).find((a) => ["instagram", "threads", "youtube"].includes(a));
const since = Date.now() - days * 86400e3;
const saved = loadState("insights", { posts: {} });
const problems = [];

// insights answers come as [{ name, values: [{ value }] }] or [{ name, total_value: { value } }]
const flat = (data = []) => Object.fromEntries(data.map((m) => [m.name, m.total_value?.value ?? m.values?.at(-1)?.value ?? 0]));

async function metrics(platform, id, sets) {
  for (const metric of sets) {
    try { return flat((await api(platform, "GET", `/${id}/insights`, { metric })).data); }
    catch (e) { if (metric === sets.at(-1)) throw e; } // some metrics do not exist for every media type: try a smaller set
  }
}

async function instagram() {
  const media = (await api("instagram", "GET", `/${IG_USER}/media`, { fields: "id,timestamp,media_type,media_product_type,permalink,caption", limit: 50 })).data || [];
  const out = [];
  for (const m of media.filter((x) => Date.parse(x.timestamp) >= since)) {
    const kind = m.media_product_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : m.media_type === "VIDEO" ? "video" : "image";
    try {
      const v = await metrics("instagram", m.id, ["views,reach,likes,comments,shares,saved", "reach,likes,comments,saved"]);
      out.push({ platform: "instagram", id: m.id, at: m.timestamp, kind, link: m.permalink, text: m.caption || "", ...v });
    } catch (e) { problems.push(`instagram ${m.id}: ${e.message}`); }
  }
  return out;
}

async function threads() {
  const posts = (await api("threads", "GET", "/me/threads", { fields: "id,timestamp,media_type,permalink,text", limit: 50 })).data || [];
  const out = [];
  for (const p of posts.filter((x) => Date.parse(x.timestamp) >= since && x.media_type !== "REPOST_FACADE")) {
    const kind = { TEXT_POST: "text", IMAGE: "image", VIDEO: "video", CAROUSEL_ALBUM: "carousel" }[p.media_type] || p.media_type?.toLowerCase();
    try {
      const v = await metrics("threads", p.id, ["views,likes,replies,reposts,quotes,shares", "views,likes,replies,reposts,quotes"]);
      out.push({ platform: "threads", id: p.id, at: p.timestamp, kind, link: p.permalink, text: p.text || "", ...v });
    } catch (e) { problems.push(`threads ${p.id}: ${e.message}`); }
  }
  return out;
}

async function youtube() {
  const { videos } = await recentVideos(50);
  const recent = videos.filter((v) => Date.parse(v.at) >= since);
  if (!recent.length) return [];
  const stats = (await yt("GET", "/videos", { part: "statistics", id: recent.map((v) => v.id).join(",") })).items || [];
  return recent.map((v) => {
    const st = stats.find((x) => x.id === v.id)?.statistics || {};
    return { platform: "youtube", id: v.id, at: v.at, kind: "short", link: `https://youtube.com/shorts/${v.id}`, text: v.title,
      views: Number(st.viewCount || 0), likes: Number(st.likeCount || 0), comments: Number(st.commentCount || 0) };
  });
}

const posts = [];
for (const [p, fn] of [["instagram", instagram], ["threads", threads], ["youtube", youtube]]) {
  if ((only && p !== only) || !config[p]) continue;
  try { posts.push(...(await fn())); } catch (e) { problems.push(`${p}: ${e.message}`); }
}
for (const x of posts) saved.posts[x.id] = { ...x, checkedAt: new Date().toISOString() };
writeFileSync(statePath("insights"), JSON.stringify(saved));

// one number to compare posts: views (or reach when views are missing) and interactions
const score = (x) => x.views ?? x.reach ?? 0;
const acts = (x) => (x.likes || 0) + (x.comments || 0) + (x.replies || 0) + (x.shares || 0) + (x.saved || 0) + (x.reposts || 0) + (x.quotes || 0);
const avg = (a, f) => (a.length ? Math.round(a.reduce((s, x) => s + f(x), 0) / a.length) : 0);

if (process.argv.includes("--json")) { console.log(JSON.stringify({ posts, problems }, null, 1)); process.exit(0); }

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
for (const platform of ["instagram", "threads", "youtube"]) {
  const list = posts.filter((x) => x.platform === platform);
  if (!list.length) continue;
  console.log(`\n== ${platform}: ${list.length} post(s) in the last ${days} days, average ${avg(list, score)} views, ${avg(list, acts)} interactions`);
  console.log("\nBest posts:");
  for (const x of [...list].sort((a, b) => score(b) - score(a)).slice(0, 5)) {
    const l = toLocal(new Date(x.at));
    console.log(`  ${score(x)} views, ${acts(x)} interactions | ${x.kind} | ${DAY[l.weekday]} ${l.date} ${l.time} | ${x.text.split("\n")[0].slice(0, 60)} | ${x.link || ""}`);
  }
  console.log("\nBy format:");
  const kinds = [...new Set(list.map((x) => x.kind))];
  for (const k of kinds) { const a = list.filter((x) => x.kind === k); console.log(`  ${k}: ${a.length} post(s), average ${avg(a, score)} views, ${avg(a, acts)} interactions`); }
  console.log("\nBy day and hour (local time; only times with 2+ posts are reliable):");
  const groups = {};
  for (const x of list) { const l = toLocal(new Date(x.at)); (groups[`${l.weekday}|${l.time.slice(0, 2)}`] ||= []).push(x); }
  const rows = Object.entries(groups).map(([k, a]) => { const [d, h] = k.split("|"); return { d: Number(d), h, n: a.length, v: avg(a, score) }; })
    .sort((a, b) => b.v - a.v);
  for (const r of rows.slice(0, 8)) console.log(`  ${DAY[r.d]} ${r.h}:00-${String(Number(r.h) + 1).padStart(2, "0")}:00  ${r.v} views  (${r.n} post${r.n > 1 ? "s" : ""})`);
  const good = rows.filter((r) => r.n >= 2).slice(0, 3);
  if (good.length) console.log(`  Suggestion: ${good.map((r) => `${DAY[r.d]} ${r.h}:00`).join(", ")} worked best; consider these windows in slots.json.`);
  else console.log("  Not enough posts yet to suggest times (needs 2+ posts at the same day and hour).");
}
if (!posts.length) console.log("No posts with statistics found.");
if (problems.length) { console.error(`\n${problems.length} problem(s):`); for (const p of problems.slice(0, 10)) console.error("  " + p); }
process.exit(problems.length && !posts.length ? 1 : 0);
