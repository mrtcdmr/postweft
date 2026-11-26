#!/usr/bin/env node
// Add a post to the queue.
//   node bin/queue-add.mjs --platform instagram --kind reel --video out/my-video.mp4 --caption-file caption.txt [--cover out/my-video.jpg] [--trial [manual|auto]]
//   node bin/queue-add.mjs --platform threads --kind text --caption "Hello" --at 2026-12-01T19:00
//   node bin/queue-add.mjs --platform x --caption "Hello https://example.com" --dry
//   node bin/queue-add.mjs --platform youtube --video out/my-video.mp4 --title "Short title" --caption-file description.txt
//   node bin/queue-add.mjs --platform tiktok --video out/my-video.mp4 --caption-file caption.txt   (sent to the app as a draft)
//   node bin/queue-add.mjs --platform instagram --media work/my-post-slides --caption-file caption.txt   (carousel:
//        a folder of .jpg/.png/.mp4 files in name order, or a comma-separated list of files)
// Without --at the next free slot from slots.json is used. --dry prints the result without saving.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { addItem } from "../lib/queue.mjs";
import { nextSlot } from "../lib/slots.mjs";
import { limitHashtags, captionProblem } from "../lib/text.mjs";
import { CAROUSEL_LIMITS, trialParams } from "../lib/meta.mjs";
import { TZ } from "../lib/config.mjs";
import { fromLocal, toLocal } from "../lib/time.mjs";
import { xTextProblem, xPublishCostUsd } from "../lib/x-text.mjs";

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
// --media: a folder or comma-separated files -> carousel (a single file becomes an image or video post)
let media = [];
if (typeof args.media === "string") {
  const m = resolve(args.media);
  media = existsSync(m) && statSync(m).isDirectory()
    ? readdirSync(m).filter((f) => /\.(jpe?g|png|mp4|mov)$/i.test(f)).sort().map((f) => join(m, f))
    : args.media.split(",").map((f) => f.trim()).filter(Boolean);
  if (media.length === 1) { if (/\.(mp4|mov)$/i.test(media[0])) args.video = media[0]; else args.image = media[0]; media = []; }
}
let kind = args.kind || (media.length ? "carousel" : args.video ? (platform === "threads" ? "video" : "reel") : args.image ? "image" : "text");
if (["threads", "youtube", "tiktok"].includes(platform) && kind === "reel") kind = "video";
if (platform === "instagram" && kind === "video") kind = "reel";
if (!["instagram", "threads", "youtube", "tiktok", "x"].includes(platform)) fail("--platform instagram|threads|youtube|tiktok|x");
if (platform === "x" && (kind !== "text" || args.media || args.video || args.image || args.cover || args.title))
  fail("X takes text or links in --caption or --caption-file");
if (["youtube", "tiktok"].includes(platform) && kind !== "video") fail(`${platform} takes a vertical video: --video file.mp4`);
if (!["reel", "video", "image", "story", "text", "carousel"].includes(kind)) fail("--kind reel|video|image|story|text|carousel");
if (platform === "instagram" && kind === "text") fail("Instagram needs an image or a video");
if (platform === "x" && (args.caption === true || args["caption-file"] === true))
  fail("--caption and --caption-file need a value");

let caption = args["caption-file"] ? readFileSync(args["caption-file"], "utf8").trim() : String(args.caption || "");
const maxTags = Number(args["max-hashtags"] ?? 5);
if (platform === "instagram" || platform === "tiktok") {
  const before = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  caption = limitHashtags(caption, maxTags);
  if (before > maxTags) console.warn(`note: ${before - maxTags} hashtag(s) dropped (limit ${maxTags})`);
}
const problem = platform === "x" ? xTextProblem(caption) : captionProblem(platform, caption);
if (problem) fail(problem);
let title;
if (platform === "youtube") {
  title = String(args.title || caption.split("\n")[0]).trim();
  if (!title) fail("youtube needs a title: --title \"...\" (or a caption whose first line is the title)");
  if ([...title].length > 100) fail(`youtube title is ${[...title].length} characters, the limit is 100: pass a shorter --title`);
  if (/[<>]/.test(title + caption)) fail("youtube does not accept < or > in the title or description");
}
let trial;
if (args.trial) {
  if (platform !== "instagram" || kind !== "reel") fail("--trial is only supported for Instagram Reels");
  const raw = args.trial === true ? "manual" : String(args.trial).trim();
  try { trial = trialParams(raw).graduation_strategy === "SS_PERFORMANCE" ? "auto" : "manual"; }
  catch { fail('--trial takes "manual" or "auto" (default: manual)'); }
}
const file = (p) => {
  if (!p || /^https?:\/\//.test(p)) return p;
  const f = resolve(p);
  if (!existsSync(f)) fail("file not found: " + p);
  return f;
};
const item = { platform, kind, trial, title, caption, video: file(args.video), image: file(args.image), cover: file(args.cover),
  media: media.length ? media.map(file) : undefined,
  slug: args.slug || (args.video || args.image || args.media)?.split("/").filter(Boolean).pop()?.replace(/\.\w+$/, "") };
if (kind === "carousel") {
  const [min, max] = CAROUSEL_LIMITS[platform];
  if (media.length < min || media.length > max) fail(`a ${platform} carousel needs ${min}-${max} images or videos (got ${media.length}); pass them with --media`);
}
if ((kind === "reel" || kind === "video") && !item.video) fail("--video is required");
if (kind === "story" && !item.video && !item.image) fail("--image or --video is required for a story");
if (kind === "image" && !item.image) fail("--image is required");
for (const k of Object.keys(item)) if (item[k] == null) delete item[k];

item.at = args.at || nextSlot(platform, item.trial ? "trial_reel" : kind);
if (!item.at) fail(`no free slot found for ${platform}/${kind}; pass --at or edit slots.json`);
if (platform === "x") {
  const badTime = () => fail(`invalid X posting time in ${TZ}; use YYYY-MM-DDTHH:MM`);
  if (typeof item.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.at)) badTime();
  let local;
  try { local = toLocal(fromLocal(item.at)); } catch { badTime(); }
  if (`${local.date}T${local.time}` !== item.at) badTime();
}
if (args.dry) {
  const preview = platform === "x" ? { ...item, timezone: TZ, estimatedPublishCostUsd: xPublishCostUsd(caption) } : item;
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}
console.log("queued:", addItem(item), "at", item.at);
