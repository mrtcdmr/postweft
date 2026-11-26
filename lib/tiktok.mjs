// TikTok Content Posting API (official), "upload to inbox" mode: the video lands in the creator's TikTok inbox as a
// draft and the creator adds the caption and posts it from the app. This works without TikTok's app audit; direct
// public posting needs an audited app and is not built in yet.
// Keys in .env: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET (developers.tiktok.com app with Login Kit + Content Posting
// API, scope video.upload) and TIKTOK_REFRESH_TOKEN (written by `node bin/connect.mjs tiktok`).
// Access tokens last 24 hours and are renewed automatically; the refresh token lasts a year and is renewed too.
import { statSync, openSync, readSync, closeSync } from "node:fs";
import { env } from "./config.mjs";
import { setEnvValue } from "./envfile.mjs";
import { sleep } from "./meta.mjs";

const API = "https://open.tiktokapis.com/v2";
let cached = null;

export async function tiktokToken(body) {
  const r = await fetch(API + "/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY || "", client_secret: env.TIKTOK_CLIENT_SECRET || "", ...body }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (j.error && j.error !== "ok") throw new Error(`tiktok login: ${j.error_description || j.error}`);
  if (!j.access_token) throw new Error("tiktok login: no token in the answer");
  return j;
}

// Renews the access token; TikTok may hand out a new refresh token, which is saved into .env.
export async function refreshTiktok() {
  for (const k of ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN"])
    if (!env[k]) throw new Error(`tiktok: ${k} missing in .env${k === "TIKTOK_REFRESH_TOKEN" ? " (run: node bin/connect.mjs tiktok)" : ""}`);
  const j = await tiktokToken({ grant_type: "refresh_token", refresh_token: env.TIKTOK_REFRESH_TOKEN });
  if (j.refresh_token && j.refresh_token !== env.TIKTOK_REFRESH_TOKEN) setEnvValue("TIKTOK_REFRESH_TOKEN", j.refresh_token);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in || 86400) * 1000 };
  return { refreshExpiresIn: j.refresh_expires_in };
}

async function tt(path, body) {
  if (!cached || cached.until < Date.now() + 60e3) await refreshTiktok();
  const r = await fetch(API + path, {
    method: "POST",
    headers: { authorization: "Bearer " + cached.token, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  if (j.error?.code && j.error.code !== "ok") throw new Error(`tiktok ${path}: ${j.error.code} ${j.error.message || ""}`.trim());
  return j.data || {};
}

// Chunks: files up to 64 MB go in one piece; bigger files in 10 MB pieces, the last piece takes the remainder.
export function chunkPlan(size) {
  const MB = 1024 * 1024;
  if (size <= 64 * MB) return { chunk_size: size, total_chunk_count: 1 };
  const chunk = 10 * MB;
  return { chunk_size: chunk, total_chunk_count: Math.floor(size / chunk) };
}

// Uploads a video to the creator's inbox. Returns { publishId }; check it with inboxStatus().
export async function uploadToInbox(file) {
  const size = statSync(file).size;
  const plan = chunkPlan(size);
  const d = await tt("/post/publish/inbox/video/init/", { source_info: { source: "FILE_UPLOAD", video_size: size, ...plan } });
  if (!d.upload_url) throw new Error("tiktok: no upload_url");
  const fd = openSync(file, "r");
  try {
    for (let i = 0; i < plan.total_chunk_count; i++) {
      const start = i * plan.chunk_size;
      const end = i === plan.total_chunk_count - 1 ? size - 1 : start + plan.chunk_size - 1;
      const buf = Buffer.alloc(end - start + 1);
      readSync(fd, buf, 0, buf.length, start);
      const r = await fetch(d.upload_url, {
        method: "PUT",
        headers: { "content-type": "video/mp4", "content-length": String(buf.length), "content-range": `bytes ${start}-${end}/${size}` },
        body: buf,
        signal: AbortSignal.timeout(10 * 60e3),
      });
      if (!r.ok) throw new Error(`tiktok upload part ${i + 1}: ${r.status}`);
    }
  } finally { closeSync(fd); }
  return { publishId: d.publish_id };
}

// PROCESSING_UPLOAD -> SEND_TO_USER_INBOX (done: the creator got a notification) or FAILED
export async function inboxStatus(publishId, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const d = await tt("/post/publish/status/fetch/", { publish_id: publishId });
    if (d.status === "FAILED") throw new Error(`tiktok processing failed: ${d.fail_reason || "unknown"}`);
    if (d.status && d.status !== "PROCESSING_UPLOAD" && d.status !== "PROCESSING_DOWNLOAD") return d.status;
    await sleep(5000);
  }
  return "PROCESSING_UPLOAD";
}
