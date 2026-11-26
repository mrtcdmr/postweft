// Mixes music.wav with the voice-over lines into <video-dir>/audio.wav.
// Each LINES[i] in timeline.mjs is placed at "at" seconds: voice/<i>.wav, or "file" (path relative to the video folder).
// Lines without an audio file are skipped. Leading/trailing silence of each line is trimmed. Music stays under the voice and opens up after MUSIC_UP seconds.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { HOME } from "../lib/data-home.mjs";

const V = resolve(process.argv[2]), FF = process.env.FFMPEG || "ffmpeg";
const M = await import(pathToFileURL(join(V, "timeline.mjs")).href);
const cfgFile = join(HOME, "config.json");
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, "utf8")) : {};
// only lines that actually have audio (no voice files = music only)
const lines = (M.LINES || []).map((l, i) => ({ ...l, src: l.file ? join(V, l.file) : join(V, "voice", i + ".wav") })).filter((l) => existsSync(l.src));
let args;
if (!lines.length) {
  args = ["-hide_banner", "-loglevel", "error", "-y", "-i", join(V, "music.wav"), "-af", `alimiter=limit=0.89,atrim=0:${M.DURATION}`, join(V, "audio.wav")];
} else {
  const ins = [], fl = [];
  lines.forEach((l, i) => {
    ins.push("-i", l.src);
    fl.push(`[${i + 1}:a]silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,aresample=44100,adelay=${Math.round(l.at * 1000)}:all=1[v${i}]`);
  });
  const up = M.MUSIC_UP ?? M.DURATION - 1, base = M.MUSIC_LEVEL ?? cfg.video?.musicLevel ?? 0.26;
  const fc = fl.join(";") + ";" + lines.map((_, i) => `[v${i}]`).join("") +
    `amix=inputs=${lines.length}:normalize=0,highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=2.2,pan=stereo|c0=c0|c1=c0,apad=whole_dur=${M.DURATION}[vox];` +
    `[0:a]equalizer=f=2200:width_type=o:width=1.6:g=-4,volume='if(lt(t,${up}),${base},${base}+0.35*min(1,(t-${up})/0.5))':eval=frame[mus];` +
    `[mus][vox]amix=inputs=2:normalize=0,alimiter=limit=0.89,atrim=0:${M.DURATION}[out]`;
  args = ["-hide_banner", "-loglevel", "error", "-y", "-i", join(V, "music.wav"), ...ins, "-filter_complex", fc, "-map", "[out]", join(V, "audio.wav")];
}
writeFileSync(join(V, "mix.args.json"), JSON.stringify(args));
const r = spawnSync(FF, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
