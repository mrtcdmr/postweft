#!/usr/bin/env node
// Add a post to the queue.
//   node bin/queue-add.mjs --platform instagram --kind reel --video out/my-video.mp4 --caption-file caption.txt [--cover out/my-video.jpg]
//   node bin/queue-add.mjs --platform threads --kind text --caption "Hello" --at 2026-12-01T19:00
// Without --at the next free slot from slots.json is used. --dry prints the result without saving.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { addItem } from "../lib/queue.mjs";
import { nextSlot } from "../lib/slots.mjs";
import { limitHashtags } from "../lib/text.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith("--")) continue;
  const v = process.argv[i + 1];
  if (v == null || v.startsWith("--")) args[k.slice(2)] = true;
  else { args[k.slice(2)] = v; i++; }
}
const fail = (m) => { console.error(m); process.exit(1); };
const platform = args.platform;
let kind = args.kind || (args.video ? (platform === "threads" ? "video" : "reel") : args.image ? "image" : "text");
if (platform === "threads" && kind === "reel") kind = "video";
if (platform === "instagram" && kind === "video") kind = "reel";
if (!["instagram", "threads"].includes(platform)) fail("--platform instagram|threads");
if (!["reel", "video", "image", "story", "text"].includes(kind)) fail("--kind reel|video|image|story|text");
if (platform === "instagram" && kind === "text") fail("Instagram needs an image or a video");

let caption = args["caption-file"] ? readFileSync(args["caption-file"], "utf8").trim() : String(args.caption || "");
const maxTags = Number(args["max-hashtags"] ?? 5);
if (platform === "instagram") {
  const before = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  caption = limitHashtags(caption, maxTags);
  if (before > maxTags) console.warn(`note: ${before - maxTags} hashtag(s) dropped (limit ${maxTags})`);
}
const file = (p) => {
  if (!p || /^https?:\/\//.test(p)) return p;
  const f = resolve(p);
  if (!existsSync(f)) fail("file not found: " + p);
  return f;
};
const item = { platform, kind, caption, video: file(args.video), image: file(args.image), cover: file(args.cover), slug: args.slug || args.video?.split("/").pop()?.replace(/\.\w+$/, "") };
if ((kind === "reel" || kind === "video") && !item.video) fail("--video is required");
if (kind === "story" && !item.video && !item.image) fail("--image or --video is required for a story");
if (kind === "image" && !item.image) fail("--image is required");
for (const k of Object.keys(item)) if (item[k] == null) delete item[k];

item.at = args.at || nextSlot(platform, kind);
if (!item.at) fail(`no free slot found for ${platform}/${kind}; pass --at or edit slots.json`);
if (args.dry) { console.log(JSON.stringify(item, null, 2)); process.exit(0); }
console.log("queued:", addItem(item), "at", item.at);
