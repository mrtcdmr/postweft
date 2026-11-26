// Shared helpers for video music tracks, multilingual voice/caption resolution, and resilient Edge TTS.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, isAbsolute, join, resolve, sep } from "node:path";

const AUDIO_EXTS = ["", ".mp3", ".wav", ".m4a", ".ogg", ".flac"];

export function normalizeLang(lang) {
  if (!lang) return "";
  return String(lang).trim().split(/[-_]/)[0].toLowerCase();
}

export function resolveCaptionLang(timeline = {}, cliArg = "", envLang = "") {
  const raw = cliArg || envLang || timeline.CAPTION_LANG || timeline.LANG || "en";
  return normalizeLang(raw) || "en";
}

// Resolves voice settings for a video:
//   config.json -> voice (default)
//   config.json -> voice.voices[lang] (picked from timeline.LANG / CAPTION_LANG)
//   timeline.mjs -> VOICE (per-video override, highest priority)
// Strips the "voices" map from the returned object so cache keys stay stable when new languages are added.
export function resolveVoiceSettings(cfgVoice = {}, timeline = {}) {
  const { voices: cfgVoices, ...base } = cfgVoice || {};
  const { voices: tlVoices, ...override } = timeline.VOICE || {};
  const voices = { ...(cfgVoices || {}), ...(tlVoices || {}) };
  const rawLang = timeline.LANG || timeline.CAPTION_LANG || override.language || base.language || "";

  let entry;
  if (rawLang && Object.keys(voices).length) {
    const exact = String(rawLang).trim();
    const lower = exact.toLowerCase();
    const short = normalizeLang(exact);
    const key = Object.keys(voices).find((k) => k === exact)
      || Object.keys(voices).find((k) => k.toLowerCase() === lower)
      || Object.keys(voices).find((k) => normalizeLang(k) === short);
    if (key) entry = voices[key];
  }

  let langOverride = {};
  if (typeof entry === "string" && entry.trim()) {
    const provider = override.provider || base.provider;
    if (provider === "piper") langOverride = { model: entry.trim() };
    else if (provider === "elevenlabs") langOverride = { voiceId: entry.trim() };
    else if (provider === "command") langOverride = { command: entry.trim() };
    else langOverride = { voice: entry.trim() };
  } else if (entry && typeof entry === "object") {
    langOverride = { ...entry };
  }

  return { ...base, ...langOverride, ...override };
}

// Resolves MUSIC_TRACK (or config.video.musicTrack) to an existing audio file path, or null to use the built-in synth.
export function resolveMusicTrack(track, { videoDir = "", home = "" } = {}) {
  if (track == null || track === false) return null;
  const s = String(track).trim();
  if (!s || s.toLowerCase() === "synth") return null;
  if (isAbsolute(s)) {
    if (existsSync(s)) return s;
    throw new Error(`music track not found: ${s}`);
  }
  const exts = extname(s) ? [""] : AUDIO_EXTS;
  const dirs = [home ? join(home, "music") : "", videoDir].filter(Boolean);
  for (const dir of dirs) {
    const root = resolve(dir);
    for (const ext of exts) {
      const cand = resolve(root, s + ext);
      if (!cand.startsWith(root + sep)) continue;
      if (existsSync(cand)) return cand;
    }
  }
  throw new Error(`music track not found: ${s} (checked ${home ? join(home, "music") : "music/"} and video folder)`);
}

// Builds FFmpeg args to loop/cut a real music file to DURATION with loudnorm and soft fade-in/fade-out -> 44.1 kHz stereo WAV.
export function musicFfmpegArgs(inputPath, outPath, { duration, offset = 0, fadeIn, fadeOut } = {}) {
  const dur = Number(duration);
  if (!Number.isFinite(dur) || dur <= 0) throw new Error(`invalid video DURATION: ${duration}`);
  const off = Number(offset ?? 0);
  if (!Number.isFinite(off) || off < 0) throw new Error(`invalid MUSIC_OFFSET: ${offset}`);
  const fi = fadeIn != null ? Number(fadeIn) : Math.min(0.4, dur / 4);
  const fo = fadeOut != null ? Number(fadeOut) : Math.min(0.8, dur / 4);
  const foStart = Math.max(0, +(dur - fo).toFixed(3));
  const filters = ["loudnorm=I=-16:TP=-1.5:LRA=11"];
  if (fi > 0) filters.push(`afade=t=in:st=0:d=${+fi.toFixed(3)}`);
  if (fo > 0) filters.push(`afade=t=out:st=${foStart}:d=${+fo.toFixed(3)}`);
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-stream_loop", "-1",
    "-i", inputPath,
    ...(off > 0 ? ["-ss", String(off)] : []),
    "-t", String(dur),
    "-vn",
    "-af", filters.join(","),
    "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le",
    outPath,
  ];
}

// Removes ANSI escapes and carriage-return progress bar updates, keeping only real error lines.
export function cleanStderr(raw) {
  if (!raw) return "";
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  const lines = text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .split("\n")
    .map((l) => l.split("\r").pop().trim())
    .filter((l) => l && !/^\d+%\|/.test(l));
  return lines.slice(-3).join(" | ");
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const defaultRun = (cmd, args, opts) => execFileSync(cmd, args, opts);

// Calls edge-tts with quiet stderr and bounded retries for transient errors (e.g. NoAudioReceived), returning 24 kHz mono PCM.
export async function edgeTtsPcm(settings, text, {
  run = defaultRun,
  sleep = defaultSleep,
  delays = [1500, 3000, 4500],
  ffmpeg = process.env.FFMPEG || "ffmpeg",
} = {}) {
  const speed = settings.speed ?? 1;
  const rate = Math.round((speed - 1) * 100);
  if (!Number.isFinite(speed) || speed <= 0 || rate <= -100 || rate > 100) {
    throw new Error("voice.speed must translate to an Edge TTS rate above -100% and at most +100%");
  }
  const bin = settings.edgeTtsBin || "edge-tts";
  const rateHz = 24000;
  const args = ["--voice", settings.voice || "en-US-AndrewNeural", `--rate=${rate >= 0 ? "+" : ""}${rate}%`, "--file", "-"];
  let lastError = "Edge TTS returned no audio";

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    let mp3;
    try {
      mp3 = run(bin, args, { input: text, stdio: ["pipe", "pipe", "pipe"], timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
      if (e.code === "ENOENT") throw new Error("Install edge-tts and make sure it is on PATH (see the setup guide)");
      lastError = cleanStderr(e.stderr) || e.message;
      if (attempt < delays.length) { await sleep(delays[attempt]); continue; }
      throw new Error(`Edge TTS failed after ${attempt + 1} attempts: ${lastError}`);
    }
    if (!mp3?.length) {
      lastError = "Edge TTS returned empty audio";
      if (attempt < delays.length) { await sleep(delays[attempt]); continue; }
      throw new Error(`Edge TTS failed after ${attempt + 1} attempts: ${lastError}`);
    }
    try {
      const pcm = run(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", String(rateHz), "-f", "s16le", "pipe:1",
      ], { input: mp3, stdio: ["pipe", "pipe", "pipe"], timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
      if (pcm?.length) return { pcm, rateHz };
      lastError = "Edge TTS returned no audio";
    } catch (e) {
      if (e.code === "ENOENT") throw new Error("Install ffmpeg and make sure it is on PATH (or set FFMPEG)");
      lastError = cleanStderr(e.stderr) || e.message;
    }
    if (attempt < delays.length) { await sleep(delays[attempt]); continue; }
    throw new Error(`Edge TTS failed after ${attempt + 1} attempts: ${lastError}`);
  }
}
