// The queue is a folder of JSON files, one per post, so you (or Claude) can read and edit it by hand.
// {
//   "platform": "instagram" | "threads",
//   "kind": "reel" | "image" | "story" | "text",
//   "at": "2026-12-01T19:00",            local time in config.timezone
//   "caption": "...",
//   "video": "/abs/path/video.mp4",       reel / threads video
//   "image": "/abs/path.jpg" | "https://...",
//   "cover": "/abs/path/cover.jpg",       optional reel cover
//   "status": "pending" | "prepared" | "published" | "failed" | "missed",
//   "link": "...", "error": "...", "tries": 0
// }
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { QUEUE } from "./config.mjs";

export function readQueue() {
  return readdirSync(QUEUE).filter((f) => f.endsWith(".json")).sort()
    .map((f) => ({ ...JSON.parse(readFileSync(join(QUEUE, f), "utf8")), _file: f }));
}

export function saveItem(item) {
  const { _file, ...data } = item;
  writeFileSync(join(QUEUE, _file), JSON.stringify(data, null, 2) + "\n");
}

export function addItem(item) {
  const slug = (item.slug || item.kind || "post").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  let file = `${item.at.replace(/[-:]/g, "").replace("T", "-")}-${item.platform}-${slug}.json`;
  for (let i = 2; existsSync(join(QUEUE, file)); i++) file = file.replace(/(-\d+)?\.json$/, `-${i}.json`);
  const { slug: _s, ...data } = item;
  saveItem({ status: "pending", ...data, _file: file });
  return file;
}
