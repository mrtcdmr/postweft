// Renders a video template to JPEG frames with headless Chromium.
// A template folder holds video.html + timeline.mjs. The page must define window.render(t) (draws the frame at t seconds,
// a pure function of t) and window.ready (a promise that resolves when images/fonts are loaded).
//   node video/capture.mjs <video-dir> all                 -> <video-dir>/frames/0000.jpg ... (30 fps, length = DURATION)
//   node video/capture.mjs <video-dir> stills 0.5 2 4.2    -> <video-dir>/stills/ (quick previews)
//   node video/capture.mjs <post-dir> slides               -> <post-dir>-slides/01.jpg ... (image / carousel templates:
//        timeline.mjs exports SLIDES = number of slides, and window.render(i) draws slide i)
// Files are served from the video folder; /_lib/ maps to this repo's video/lib (common.css, common.js).
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { extname, join, resolve, dirname, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "playwright";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "lib");
const [dirArg, mode = "all", ...times] = process.argv.slice(2);
if (!dirArg) { console.error("usage: node video/capture.mjs <dir> all|stills [t ...]|slides"); process.exit(1); }
const VDIR = resolve(dirArg);
const TL = await import(pathToFileURL(join(VDIR, "timeline.mjs")).href);
const W = TL.WIDTH || 1080, H = TL.HEIGHT || 1920, FPS = TL.FPS || 30;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const [root, rel] = url.startsWith("/_lib/") ? [LIB, url.slice(6)] : [VDIR, url];
  const p = join(root, rel);
  if (!p.startsWith(root + sep) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[extname(p).toLowerCase()] ?? "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(0, "127.0.0.1");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/video.html`);
await page.evaluate(() => window.ready);
await page.evaluate(() => document.fonts.ready);
if (errors.length) { console.error("PAGE ERROR:", errors.join(" | ")); process.exit(1); }

// Word-by-word captions: if captions.json exists (written by captions.mjs) the spoken word is highlighted on every frame.
const CAP = join(VDIR, "captions.json");
if (existsSync(CAP)) await page.evaluate((A) => {
  const st = document.createElement("style");
  st.textContent = `#sa-cap{position:absolute;left:50px;right:50px;top:${A.top}px;text-align:center;font-weight:800;font-size:58px;line-height:1.25;color:#fff;z-index:999;pointer-events:none;font-family:var(--caption-font, var(--display-font, sans-serif))}
#sa-cap .k{display:inline-block;padding:4px 16px;margin:4px 2px;border-radius:16px;background:var(--caption-bg, rgba(0,0,0,.65))}
#sa-cap .k.on{background:var(--caption-on-bg, #ffe14d);color:var(--caption-on-fg, #111)}`;
  document.head.appendChild(st);
  const cap = document.createElement("div"); cap.id = "sa-cap";
  (document.getElementById("stage") || document.body).appendChild(cap);
  const K = A.words, orig = window.render;
  window.render = async (t) => {
    await orig(t);
    let html = "";
    if (A.end == null || t < A.end) {
      const i = K.findIndex((x, n) => t >= x.a - 0.05 && t < (K[n + 1]?.s === x.s ? K[n + 1].a : x.b + 0.35));
      if (i >= 0) {
        const line = K.filter((x) => x.s === K[i].s), j = line.indexOf(K[i]), b = Math.floor(j / 3) * 3;
        html = line.slice(b, b + 3).map((x, k) => `<span class="k${b + k === j ? " on" : ""}">${x.w.replace(/[.,;:!?…]+$/, "")}</span>`).join(" ");
      }
    }
    if (cap.innerHTML !== html) cap.innerHTML = html;
  };
}, JSON.parse(readFileSync(CAP, "utf8")));

const shot = async (t, path) => {
  await page.evaluate((t) => window.render(t), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path, type: "jpeg", quality: 94 });
};
if (mode === "slides") {
  if (!TL.SLIDES) { console.error("timeline.mjs must export SLIDES (number of slides)"); process.exit(1); }
  const out = VDIR + "-slides";
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (let i = 0; i < TL.SLIDES; i++) await shot(i, join(out, `${String(i + 1).padStart(2, "0")}.jpg`));
  console.log(`${TL.SLIDES} slide(s) in ${out}`);
} else if (mode === "stills") {
  mkdirSync(join(VDIR, "stills"), { recursive: true });
  for (const t of times) await shot(Number(t), join(VDIR, "stills", `t${Number(t).toFixed(2)}.jpg`));
} else {
  rmSync(join(VDIR, "frames"), { recursive: true, force: true });
  mkdirSync(join(VDIR, "frames"), { recursive: true });
  const n = Math.round(TL.DURATION * FPS);
  for (let i = 0; i < n; i++) {
    await shot(i / FPS, join(VDIR, "frames", `${String(i).padStart(4, "0")}.jpg`));
    if (process.stdout.isTTY && i % 30 === 0) process.stdout.write(`\rframe ${i}/${n}`);
  }
  if (process.stdout.isTTY) process.stdout.write("\n");
}
if (errors.length) { console.error("PAGE ERROR:", errors.join(" | ")); process.exit(1); }
console.log("captured", mode);
await browser.close();
server.close();
