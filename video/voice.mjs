// Voice-over: turns every LINES[i].text in timeline.mjs into <video-dir>/voice/<i>.wav with the text-to-speech service
// you choose. build.sh runs it automatically; you can also run it alone to listen first:
//   node video/voice.mjs <video-dir> [--force]
//
// Settings: "voice" in config.json (data directory), overridden per video by `export const VOICE = {...}` in timeline.mjs.
//   { "provider": "elevenlabs", "voiceId": "...", "model": "eleven_multilingual_v2", "speed": 1.0 }
//   { "provider": "openai", "voice": "alloy", "model": "gpt-4o-mini-tts", "instructions": "warm, upbeat", "speed": 1.0 }
//   { "provider": "gemini", "voice": "Kore", "model": "gemini-2.5-flash-preview-tts", "instructions": "Say cheerfully:" }
//   { "provider": "command", "command": "piper --model en_US-lessac-medium.onnx --output_file {out}" }  (text on stdin)
//   { "provider": "none" }  -> no voice (or simply no "voice" setting); you can still drop your own recordings in voice/
// Keys go in the .env file of the data directory (or the environment): ELEVENLABS_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY.
// A line is generated again only when its text or the voice settings change (voice/<i>.json remembers them), and
// recordings you put there yourself (a .wav without .json) are never overwritten.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const V = resolve(process.argv[2] || "."), force = process.argv.includes("--force");
const HOME = process.env.SOCIAL_AUTOPILOT_HOME || join(homedir(), ".config/social-autopilot");
const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
const env = { ...Object.fromEntries((existsSync(join(HOME, ".env")) ? readFileSync(join(HOME, ".env"), "utf8") : "").split("\n")
  .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])), ...process.env };
const M = await import(pathToFileURL(join(V, "timeline.mjs")).href + "?" + Date.now());
const S = { ...(readJson(join(HOME, "config.json")).voice || {}), ...(M.VOICE || {}) };
if (!S.provider || S.provider === "none" || existsSync(join(V, "no-voice"))) process.exit(0);

// 16-bit mono PCM -> WAV file
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
// length of a WAV in seconds (reads the header)
function seconds(buf) {
  const rate = buf.readUInt32LE(24), bytes = buf.readUInt32LE(28);
  let i = 12;
  while (i < buf.length - 8) { const id = buf.toString("ascii", i, i + 4), n = buf.readUInt32LE(i + 4); if (id === "data") return Math.min(n, buf.length - i - 8) / bytes; i += 8 + n; }
  return buf.length / (rate * 2);
}
const need = (k) => { if (!env[k]) throw new Error(`${k} missing (put it in ${join(HOME, ".env")})`); return env[k]; };

const PROVIDERS = {
  async elevenlabs(text) {
    if (!S.voiceId) throw new Error('voice.voiceId is required for ElevenLabs');
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${S.voiceId}?output_format=pcm_24000`, {
      method: "POST",
      headers: { "xi-api-key": need("ELEVENLABS_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: S.model || "eleven_multilingual_v2", ...(S.language ? { language_code: S.language } : {}),
        ...(S.speed || S.stability != null ? { voice_settings: { ...(S.speed ? { speed: S.speed } : {}), ...(S.stability != null ? { stability: S.stability } : {}) } } : {}) }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return wav(Buffer.from(await r.arrayBuffer()), 24000);
  },
  async openai(text) {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: "Bearer " + need("OPENAI_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ model: S.model || "gpt-4o-mini-tts", voice: S.voice || "alloy", input: text, response_format: "wav",
        ...(S.instructions ? { instructions: S.instructions } : {}), ...(S.speed ? { speed: S.speed } : {}) }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return Buffer.from(await r.arrayBuffer());
  },
  async gemini(text) {
    const model = S.model || "gemini-2.5-flash-preview-tts";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": need("GEMINI_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: S.instructions ? `${S.instructions} ${text}` : text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: S.voice || "Kore" } } } } }),
    });
    const j = await r.json();
    if (j.error) throw new Error("Gemini: " + j.error.message);
    const data = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error("Gemini returned no audio");
    return wav(Buffer.from(data, "base64"), 24000);
  },
  async command(text, out) {
    if (!S.command) throw new Error('voice.command is empty');
    execSync(S.command.replaceAll("{out}", `'${out.replace(/'/g, `'\\''`)}'`), { input: text, stdio: ["pipe", "ignore", "inherit"] });
    return null; // the command wrote the file itself
  },
};
const make = PROVIDERS[S.provider];
if (!make) { console.error(`unknown voice.provider "${S.provider}" (elevenlabs | openai | gemini | command | none)`); process.exit(1); }

mkdirSync(join(V, "voice"), { recursive: true });
const settings = JSON.stringify(S);
let made = 0, problems = 0;
for (const [i, l] of (M.LINES || []).entries()) {
  if (!l.text || l.file) continue;
  const out = join(V, "voice", i + ".wav"), meta = join(V, "voice", i + ".json");
  const key = createHash("md5").update(l.text + "\n" + settings).digest("hex");
  if (existsSync(out) && !existsSync(meta) && !force) continue;            // your own recording: keep it
  if (existsSync(out) && readJson(meta).key === key && !force) continue;   // unchanged
  const buf = await make(l.text, out);
  if (buf) writeFileSync(out, buf);
  writeFileSync(meta, JSON.stringify({ key, text: l.text }));
  made++;
  // does the line fit its slot? (build.sh trims silence at both ends, so this is a slight overestimate)
  const len = seconds(readFileSync(out)), slot = l.until != null ? l.until - l.at : null;
  if (slot != null && len > slot + 0.15) {
    problems++;
    console.warn(`line ${i} is ${len.toFixed(1)} s but has ${slot.toFixed(1)} s: shorten the text, raise "speed", or move "until"`);
  }
}
console.log(`voice: ${made} line(s) generated with ${S.provider}${problems ? `, ${problems} too long` : ""}`);
