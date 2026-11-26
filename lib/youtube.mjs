// YouTube Data API v3 (official): upload Shorts, read and answer comments on your own videos, read statistics.
// Keys in .env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET (a Google Cloud OAuth "Desktop app" client) and
// YOUTUBE_REFRESH_TOKEN (written by `node bin/connect.mjs youtube`). Videos are uploaded straight from disk, so no
// public media URL is needed.
import { statSync, readFileSync } from "node:fs";
import { config, env } from "./config.mjs";

export const YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"];
const API = "https://www.googleapis.com/youtube/v3";
let cached = null;

export async function googleToken(body) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.YOUTUBE_CLIENT_ID || "", client_secret: env.YOUTUBE_CLIENT_SECRET || "", ...body }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (j.error) throw new Error(`youtube login: ${j.error_description || j.error}`);
  return j;
}

async function accessToken() {
  if (cached && cached.until > Date.now() + 60e3) return cached.token;
  for (const k of ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"])
    if (!env[k]) throw new Error(`youtube: ${k} missing in .env${k === "YOUTUBE_REFRESH_TOKEN" ? " (run: node bin/connect.mjs youtube)" : ""}`);
  const j = await googleToken({ grant_type: "refresh_token", refresh_token: env.YOUTUBE_REFRESH_TOKEN });
  cached = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function yt(method, path, params = {}, body) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const r = await fetch(u, {
    method,
    headers: { authorization: "Bearer " + (await accessToken()), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const j = r.status === 204 ? {} : await r.json();
  if (j.error) throw new Error(`youtube ${path}: ${j.error.message}`);
  return j;
}

// Title: max 100 characters, no < or > (YouTube rejects them). Description: max 5000 bytes.
export const ytTitle = (s) => String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
export const ytDescription = (s) => { let d = String(s || "").replace(/[<>]/g, ""); while (Buffer.byteLength(d) > 5000) d = d.slice(0, -20); return d; };

// Uploads a video (resumable upload, one request for the bytes). publishAt (ISO time in the future) keeps it
// private until then and YouTube publishes it on time by itself. Returns { id, link }.
export async function uploadShort(file, { title, description, publishAt }) {
  const yc = config.youtube || {};
  const status = publishAt
    ? { privacyStatus: "private", publishAt, selfDeclaredMadeForKids: !!yc.madeForKids }
    : { privacyStatus: yc.privacy || "public", selfDeclaredMadeForKids: !!yc.madeForKids };
  const meta = { snippet: { title: ytTitle(title), description: ytDescription(description), categoryId: String(yc.categoryId || "22"), ...(yc.language ? { defaultLanguage: yc.language, defaultAudioLanguage: yc.language } : {}) }, status };
  const size = statSync(file).size;
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { authorization: "Bearer " + (await accessToken()), "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "video/mp4", "x-upload-content-length": String(size) },
    body: JSON.stringify(meta),
    signal: AbortSignal.timeout(60000),
  });
  const where = init.headers.get("location");
  if (!init.ok || !where) throw new Error(`youtube upload start ${init.status}: ${(await init.text()).slice(0, 200)}`);
  const r = await fetch(where, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(size) }, body: readFileSync(file), signal: AbortSignal.timeout(15 * 60e3) });
  const j = await r.json();
  if (j.error || !j.id) throw new Error(`youtube upload: ${j.error?.message || r.status}`);
  if (publishAt && j.status?.privacyStatus !== "private") throw new Error("youtube: scheduled upload did not stay private");
  return { id: j.id, link: `https://youtube.com/shorts/${j.id}`, privacy: j.status?.privacyStatus };
}

// My channel id and the playlist that holds my uploads
export async function myChannel() {
  const c = (await yt("GET", "/channels", { part: "id,contentDetails", mine: "true" })).items?.[0];
  if (!c) throw new Error("youtube: no channel on this account");
  return { id: c.id, uploads: c.contentDetails.relatedPlaylists.uploads };
}

export async function recentVideos(limit = 15) {
  const ch = await myChannel();
  const items = (await yt("GET", "/playlistItems", { part: "contentDetails,snippet", playlistId: ch.uploads, maxResults: limit })).items || [];
  return { channel: ch, videos: items.map((x) => ({ id: x.contentDetails.videoId, title: x.snippet.title, at: x.contentDetails.videoPublishedAt || x.snippet.publishedAt })) };
}
