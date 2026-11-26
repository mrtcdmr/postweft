#!/usr/bin/env node
// Publishes due posts from the queue. Run it every 5 minutes from cron (see examples/crontab.txt).
// Videos are uploaded and processed 45 minutes early, images 10 minutes early, then published on time.
// A post more than 3 hours late is marked "missed" instead of being published late. Three failures -> "failed".
// YouTube: the Short is uploaded 45 minutes early as private with a publish time, and YouTube publishes it on time.
// TikTok: at the planned time the video is sent to the TikTok app's inbox as a draft and you get a phone notification
// with the caption; you finish and post it in the app (direct posting needs an audited TikTok app).
import { config, logger, QUEUE } from "../lib/config.mjs";
import { readQueue, readItem, saveItem } from "../lib/queue.mjs";
import { closeSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fromLocal } from "../lib/time.mjs";
import { publicUrl, cleanup } from "../lib/media.mjs";
import { createContainer, waitReady, publishContainer } from "../lib/meta.mjs";
import { threadsText } from "../lib/text.mjs";
import { notify } from "../lib/notify.mjs";
import { uploadShort } from "../lib/youtube.mjs";
import { uploadToInbox, inboxStatus } from "../lib/tiktok.mjs";
import { X_API, xAccessToken } from "../lib/x.mjs";
import { xTextProblem } from "../lib/x-text.mjs";

const log = logger("publish");
const now = Date.now();

async function youtubeStep(item, due) {
  if (item.status !== "prepared" && now >= due - 45 * 60e3) {
    const publishAt = due > now + 3 * 60e3 ? new Date(due).toISOString() : null; // late or on time: public right away
    const r = await uploadShort(item.video, { title: item.title || (item.caption || "").split("\n")[0], description: item.caption || "", publishAt });
    Object.assign(item, { mediaId: r.id, link: r.link, status: publishAt ? "prepared" : "published", ...(publishAt ? {} : { publishedAt: new Date().toISOString() }) });
    saveItem(item); log(publishAt ? "prepared" : "published", item._file, r.link);
  }
  if (item.status === "prepared" && now >= due) {
    Object.assign(item, { status: "published", publishedAt: new Date().toISOString() });
    saveItem(item); log("published", "youtube", item.link);
  }
}

async function tiktokStep(item, due) {
  if (now < due) return;
  let st;
  if (item.status !== "prepared") {
    const r = await uploadToInbox(item.video);
    Object.assign(item, { publishId: r.publishId, status: "prepared" }); saveItem(item); // never upload twice
  }
  st = await inboxStatus(item.publishId, item.tries ? 2 : 8);
  if (st === "PROCESSING_UPLOAD") { log("tiktok still processing", item._file); return; }
  Object.assign(item, { status: "published", inbox: true, link: "TikTok app inbox (draft)", publishedAt: new Date().toISOString() });
  saveItem(item); log("published", "tiktok inbox", item._file);
  await notify("TikTok draft is ready", `Open TikTok, tap the notification and post it. Caption to paste:\n\n${item.caption || ""}`, 4, "movie_camera");
}

async function xStep(file) {
  const lock = join(QUEUE, `.${file}.x-lock`);
  let fd;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch (e) {
    if (e.code === "EEXIST") return;
    throw e;
  }
  let item;
  let link;
  try {
    try { item = readItem(file); }
    catch (e) { if (e.code === "ENOENT") return; throw e; }
    if (item.platform !== "x" || (item.status || "pending") !== "pending") return;
    const due = fromLocal(item.at).getTime();
    if (now < due) return;
    if (await markMissed(item, due)) return;
    if (!config.x) throw new Error("X is not enabled in config.json");
    if (item.kind !== "text" || item.video || item.image || item.media || item.cover)
      throw new Error("X queue items must be text posts");
    const problem = xTextProblem(item.caption);
    if (problem) throw new Error(problem);
    const token = await xAccessToken();
    // Persist this before sending. After a timeout or interruption a second request could publish a duplicate.
    saveItem({ ...item, status: "publishing" });
    item.status = "publishing";
    const response = await fetch(X_API + "/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: item.caption }),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!response.ok) {
      if ([400, 401, 402, 403, 404, 422, 429].includes(response.status)) item.status = "pending";
      throw new Error(`X rejected the publish request (HTTP ${response.status})`);
    }
    const { data } = await response.json();
    if (typeof data?.id !== "string" || !/^\d+$/.test(data.id)) throw new Error("X did not return a post ID");
    const postLink = `https://x.com/i/web/status/${data.id}`;
    delete item.error;
    saveItem({ ...item, status: "published", link: postLink, mediaId: data.id, publishedAt: new Date().toISOString() });
    link = postLink;
  } catch (e) {
    // Save the result while still holding the lock so another publisher sees the latest status.
    if (!item) throw e;
    await publishError(item, e);
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
  if (link) log("published", "x", link);
}

async function markMissed(item, due) {
  if (now <= due + 3 * 3600e3 || (item.status === "prepared" && ["youtube", "tiktok"].includes(item.platform))) return false;
  item.status = "missed";
  saveItem(item);
  log("MISSED", item._file);
  await notify("Post missed", `${item.platform}: ${item._file}\nIt was not published on time.`, 4, "warning");
  return true;
}

async function publishError(item, e) {
  const uncertain = item.platform === "x" && item.status === "publishing";
  item.tries = (item.tries || 0) + 1;
  item.error = uncertain ? "X publication could not be confirmed. Check the X account before requeueing." : e.message;
  if (uncertain || item.tries >= 3) {
    item.status = "failed";
  } else if (item.status === "prepared" && /container|creation/i.test(e.message)) {
    item.status = "pending"; // container expired: prepare again next run
  }
  saveItem(item);
  log("ERROR", item._file, item.error);
  if (item.status === "failed") await notify("Post failed", `${item._file}\n${item.error.slice(0, 300)}`, 4, "warning");
}

for (const item of readQueue()) {
  if (!["pending", "prepared"].includes(item.status || "pending")) continue;
  const due = fromLocal(item.at).getTime();
  const hasVideo = item.video || (item.media || []).some((f) => /\.(mp4|mov|m4v|webm)$/i.test(f));
  const early = hasVideo ? 45 * 60e3 : item.image || item.media ? 10 * 60e3 : 0;
  try {
    if (item.platform === "x") { if (now >= due) await xStep(item._file); continue; }
    if (await markMissed(item, due)) continue;
    if (item.platform === "youtube") { await youtubeStep(item, due); continue; }
    if (item.platform === "tiktok") { await tiktokStep(item, due); continue; }
    if (item.status !== "prepared" && now >= due - early) {
      const caption = item.platform === "threads" ? threadsText(item.caption || "") : item.caption || "";
      const video = item.video ? publicUrl(item.video) : null;
      const image = item.image ? publicUrl(item.image) : null;
      const cover = item.cover && item.platform === "instagram" ? publicUrl(item.cover) : null;
      const media = (item.media || []).map((f) => publicUrl(f));
      item.uploaded = [video?.name, image?.name, cover?.name, ...media.map((m) => m.name)].filter(Boolean);
      item.container = await createContainer(item.platform, item.kind, {
        caption, videoUrl: video?.url, imageUrl: image?.url, coverUrl: cover?.url, topicTag: config.threads?.topicTag,
        items: media.map((m) => m.url), trial: item.trial,
      });
      if (video || image || media.length) await waitReady(item.platform, item.container);
      item.status = "prepared"; saveItem(item); log("prepared", item._file);
    }
    if (item.status === "prepared" && now >= due) {
      const r = await publishContainer(item.platform, item.container);
      for (const n of item.uploaded || []) cleanup(n);
      Object.assign(item, { status: "published", link: r.link, mediaId: r.id, publishedAt: new Date().toISOString() });
      saveItem(item); log("published", item.platform + (item.trial ? ` trial:${item.trial}` : ""), r.link || r.id);
    }
  } catch (e) {
    if (item.platform === "x") {
      log("ERROR", item._file, "Could not process the X queue item:", e.message);
    } else {
      await publishError(item, e);
    }
  }
}
