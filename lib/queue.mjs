// The queue is a folder of JSON files, one per post, so you (or your AI agent) can read and edit it by hand.
// {
//   "platform": "instagram" | "threads",
//   "kind": "reel" | "image" | "story" | "text",
//   "at": "2026-12-01T19:00",            local time in config.timezone
//   "caption": "...",
//   "video": "/abs/path/video.mp4",       reel / threads video
//   "image": "/abs/path.jpg" | "https://...",
//   "cover": "/abs/path/cover.jpg",       optional reel cover
//   "status": "pending" | "prepared" | "publishing" | "published" | "failed" | "missed",
//   "link": "...", "error": "...", "tries": 0
// }
import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { QUEUE } from "./config.mjs";

export function readItem(file) {
  return { ...JSON.parse(readFileSync(join(QUEUE, file), "utf8")), _file: file };
}

export function readQueue() {
  return readdirSync(QUEUE).filter((f) => f.endsWith(".json")).sort().map(readItem);
}

export function saveItem(item) {
  const { _file, ...data } = item;
  const temp = join(QUEUE, `.${_file}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    renameSync(temp, join(QUEUE, _file));
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export function addItem(item) {
  const slug = (item.slug || item.kind || "post").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  let file = `${item.at.replace(/[-:]/g, "").replace("T", "-")}-${item.platform}-${slug}.json`;
  for (let i = 2; existsSync(join(QUEUE, file)); i++) file = file.replace(/(-\d+)?\.json$/, `-${i}.json`);
  const { slug: _s, ...data } = item;
  saveItem({ status: "pending", ...data, _file: file });
  return file;
}
