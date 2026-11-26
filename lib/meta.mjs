// Official Instagram Graph API and Threads API calls (no browser automation, no scraping).
// Tokens: INSTAGRAM_TOKEN and THREADS_TOKEN in the .env file of the data directory.
import { config, env } from "./config.mjs";

const BASE = {
  instagram: config.instagram?.apiBase || "https://graph.facebook.com/v23.0",
  threads: config.threads?.apiBase || "https://graph.threads.net/v1.0",
};
const TOKEN = { instagram: env.INSTAGRAM_TOKEN, threads: env.THREADS_TOKEN };
export const IG_USER = config.instagram?.userId;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(platform, method, path, params = {}, body) {
  if (!TOKEN[platform]) throw new Error(`${platform}: token missing in .env`);
  const u = new URL(BASE[platform] + path);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const r = await fetch(u, {
    method,
    headers: { Authorization: "Bearer " + TOKEN[platform], ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${platform} ${path}: ${j.error.message}`);
  return j;
}

// Poll a media container until it is ready (videos can take several minutes).
export async function waitReady(platform, id, tries = 160) {
  for (let i = 0; i < tries; i++) {
    const s = await api(platform, "GET", "/" + id, { fields: platform === "instagram" ? "status_code,status" : "status,error_message" });
    const st = s.status_code || s.status;
    if (st === "FINISHED" || st === "PUBLISHED") return;
    if (st === "ERROR" || st === "EXPIRED") throw new Error(`processing failed: ${s.error_message || s.status}`);
    await sleep(15000);
  }
  throw new Error("media was not processed in time");
}

// Create a container (step 1). Returns the container id.
export async function createContainer(platform, kind, { caption = "", videoUrl, imageUrl, coverUrl, topicTag } = {}) {
  if (platform === "instagram") {
    const p = kind === "reel" ? { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: "true", cover_url: coverUrl }
      : kind === "story" ? { media_type: "STORIES", ...(videoUrl ? { video_url: videoUrl } : { image_url: imageUrl }) }
      : kind === "image" ? { image_url: imageUrl, caption }
      : null;
    if (!p) throw new Error(`instagram does not support kind "${kind}"`);
    return (await api("instagram", "POST", `/${IG_USER}/media`, p)).id;
  }
  const p = kind === "text" ? { media_type: "TEXT", text: caption }
    : videoUrl ? { media_type: "VIDEO", video_url: videoUrl, text: caption }
    : { media_type: "IMAGE", image_url: imageUrl, text: caption };
  if (topicTag) p.topic_tag = topicTag.replace(/[.&]/g, "");
  return (await api("threads", "POST", "/me/threads", p)).id;
}

// Publish a ready container (step 2). Returns { id, link }.
export async function publishContainer(platform, containerId) {
  const r = platform === "instagram"
    ? await api("instagram", "POST", `/${IG_USER}/media_publish`, { creation_id: containerId })
    : await api("threads", "POST", "/me/threads_publish", { creation_id: containerId });
  let link = "";
  try { link = (await api(platform, "GET", "/" + r.id, { fields: "permalink" })).permalink; } catch { /* optional */ }
  return { id: r.id, link };
}
