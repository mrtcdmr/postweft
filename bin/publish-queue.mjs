#!/usr/bin/env node
// Publishes due posts from the queue. Run it every 5 minutes from cron (see examples/crontab.txt).
// Videos are uploaded and processed 45 minutes early, images 10 minutes early, then published on time.
// A post more than 3 hours late is marked "missed" instead of being published late. Three failures -> "failed".
import { config, logger } from "../lib/config.mjs";
import { readQueue, saveItem } from "../lib/queue.mjs";
import { fromLocal } from "../lib/time.mjs";
import { publicUrl, cleanup } from "../lib/media.mjs";
import { createContainer, waitReady, publishContainer } from "../lib/meta.mjs";
import { threadsText } from "../lib/text.mjs";
import { notify } from "../lib/notify.mjs";

const log = logger("publish");
const now = Date.now();

for (const item of readQueue()) {
  if (!["pending", "prepared"].includes(item.status || "pending")) continue;
  const due = fromLocal(item.at).getTime();
  const early = item.video ? 45 * 60e3 : item.image ? 10 * 60e3 : 0;
  try {
    if (now > due + 3 * 3600e3) {
      item.status = "missed"; saveItem(item); log("MISSED", item._file);
      await notify("Post missed", `${item.platform}: ${item._file}\nIt was not published on time.`, 4, "warning");
      continue;
    }
    if (item.status !== "prepared" && now >= due - early) {
      const caption = item.platform === "threads" ? threadsText(item.caption || "") : item.caption || "";
      const video = item.video ? publicUrl(item.video) : null;
      const image = item.image ? publicUrl(item.image) : null;
      const cover = item.cover && item.platform === "instagram" ? publicUrl(item.cover) : null;
      item.uploaded = [video?.name, image?.name, cover?.name].filter(Boolean);
      item.container = await createContainer(item.platform, item.kind, {
        caption, videoUrl: video?.url, imageUrl: image?.url, coverUrl: cover?.url, topicTag: config.threads?.topicTag,
      });
      if (video || image) await waitReady(item.platform, item.container);
      item.status = "prepared"; saveItem(item); log("prepared", item._file);
    }
    if (item.status === "prepared" && now >= due) {
      const r = await publishContainer(item.platform, item.container);
      for (const n of item.uploaded || []) cleanup(n);
      Object.assign(item, { status: "published", link: r.link, mediaId: r.id, publishedAt: new Date().toISOString() });
      saveItem(item); log("published", item.platform, r.link || r.id);
    }
  } catch (e) {
    item.tries = (item.tries || 0) + 1; item.error = e.message;
    if (item.tries >= 3) {
      item.status = "failed";
      await notify("Post failed", `${item._file}\n${e.message.slice(0, 300)}`, 4, "warning");
    } else if (item.status === "prepared" && /container|creation/i.test(e.message)) {
      item.status = "pending"; // container expired: prepare again next run
    }
    saveItem(item); log("ERROR", item._file, e.message);
  }
}
