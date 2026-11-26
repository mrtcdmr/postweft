// Word-by-word captions from the voice-over (optional; needs Python with faster-whisper: pip install faster-whisper).
//   node video/captions.mjs <video-dir> [language]     -> <video-dir>/captions.json (capture.mjs draws it)
// Every LINES[i] in timeline.mjs with a "text" and a voice/<i>.wav file is aligned. Only the known script is shown on
// screen: speech recognition is used for timing only, so it can never put invented words in the captions.
// Skipped: line 0 (the hook is usually already big on screen), lines with "file" (ready-made audio), lines after END,
// and everything if <video-dir>/no-captions exists. Caption position: "top" in captions.json (default 1700 px, kept if edited).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const V = resolve(process.argv[2] || "."), LANG = process.argv[3] || process.env.CAPTION_LANG || "en";
const out = join(V, "captions.json");
if (existsSync(join(V, "no-captions"))) process.exit(0);
const PY = process.env.PYTHON || "python3", SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "word_times.py");
const CACHE = join(homedir(), ".cache/social-autopilot-captions");
mkdirSync(CACHE, { recursive: true });
const M = await import(pathToFileURL(join(V, "timeline.mjs")).href + "?" + Date.now());
const old = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
const norm = (x) => x.toLocaleLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");
const words = [];

for (const [i, l] of (M.LINES || []).entries()) {
  if (i === 0 || !l.text || l.file) continue;
  if (M.END != null && l.at >= M.END) continue;
  const wav = join(V, "voice", i + ".wav");
  if (!existsSync(wav)) continue;
  const key = createHash("md5").update(readFileSync(wav)).update(LANG).digest("hex"), cf = join(CACHE, key + ".json");
  if (!existsSync(cf)) writeFileSync(cf, execFileSync(PY, [SCRIPT, wav, l.text, LANG], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const heard = JSON.parse(readFileSync(cf, "utf8"));
  const known = l.text.split(/\s+/).filter(Boolean), z = known.map(() => null);
  let k = 0;
  for (let n = 0; n < known.length; n++)
    for (let m = k; m < Math.min(heard.length, k + 4); m++)
      if (norm(heard[m].w) === norm(known[n])) { z[n] = [heard[m].a, heard[m].b]; k = m + 1; break; }
  if (!z.some(Boolean)) {
    // nothing matched: spread the words over the speech by length
    const total = known.reduce((t, x) => t + x.length + 1, 0), dur = Math.max(1, (heard.at(-1)?.b ?? known.length * 0.4) - (heard[0]?.a ?? 0));
    let t = heard[0]?.a ?? 0; known.forEach((x, n) => { const d = dur * (x.length + 1) / total; z[n] = [t, t + d]; t += d; });
  } else {
    // unmatched runs share the gap up to the next matched word, by length
    for (let n = 0; n < known.length; n++) {
      if (z[n]) continue;
      let e = n; while (e < known.length && !z[e]) e++;
      const prev = z.slice(0, n).filter(Boolean).at(-1), a = prev ? prev[1] : (e < known.length ? Math.min(z[e][0], 0) : 0);
      const b = e < known.length ? z[e][1] : a + 0.4 * (e - n), group = known.slice(n, Math.min(e + 1, known.length));
      const total = group.reduce((t, x) => t + x.length + 1, 0); let t = a;
      group.forEach((x, q) => { const d = (b - a) * (x.length + 1) / total; z[n + q] = [t, t + d]; t += d; });
      n = e;
    }
  }
  const s = z[0][0]; // build.sh trims leading silence, so the first word starts at l.at
  known.forEach((x, n) => words.push({ w: x, a: +(l.at + z[n][0] - s).toFixed(2), b: +(l.at + z[n][1] - s).toFixed(2), s: i }));
}
writeFileSync(out, JSON.stringify({ top: old.top ?? M.CAPTION_TOP ?? 1700, end: M.END ?? null, words }));
console.log("captions:", words.length, "words");
