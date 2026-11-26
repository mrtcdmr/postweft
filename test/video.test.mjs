import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  normalizeLang,
  resolveCaptionLang,
  resolveVoiceSettings,
  resolveMusicTrack,
  musicFfmpegArgs,
  cleanStderr,
  edgeTtsPcm,
} from "../lib/video.mjs";

function makeWav(seconds, rate = 44100, channels = 2) {
  const frames = Math.round(seconds * rate);
  const dataBytes = frames * channels * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++) {
    const s = Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / rate));
    for (let c = 0; c < channels; c++) buf.writeInt16LE(s, 44 + (i * channels + c) * 2);
  }
  return buf;
}

test("multilingual voice.voices and caption LANG resolution", () => {
  assert.equal(normalizeLang("tr-TR"), "tr");
  assert.equal(resolveCaptionLang({ LANG: "tr" }), "tr");
  assert.equal(resolveCaptionLang({ LANG: "tr", CAPTION_LANG: "de" }), "de");
  assert.equal(resolveCaptionLang({ LANG: "tr" }, "", "fr"), "fr");
  assert.equal(resolveCaptionLang({ LANG: "tr" }, "es", "fr"), "es");
  assert.equal(resolveCaptionLang({}), "en");

  const edgeCfg = {
    provider: "edge-tts",
    voice: "en-US-AndrewNeural",
    voices: { en: "en-US-AndrewNeural", tr: "tr-TR-AhmetNeural" },
    speed: 1.0,
  };
  const trResolved = resolveVoiceSettings(edgeCfg, { LANG: "tr" });
  assert.deepEqual(trResolved, { provider: "edge-tts", voice: "tr-TR-AhmetNeural", speed: 1.0 });
  assert.equal("voices" in trResolved, false);

  const enVariant = resolveVoiceSettings(edgeCfg, { LANG: "en-US", VOICE: { speed: 1.1 } });
  assert.deepEqual(enVariant, { provider: "edge-tts", voice: "en-US-AndrewNeural", speed: 1.1 });

  const explicitWin = resolveVoiceSettings(edgeCfg, { LANG: "tr", VOICE: { voice: "tr-TR-EmelNeural" } });
  assert.equal(explicitWin.voice, "tr-TR-EmelNeural");

  const piperCfg = { provider: "piper", model: "en_US-lessac-medium", voices: { tr: "tr_TR-dfki-medium" } };
  assert.deepEqual(resolveVoiceSettings(piperCfg, { LANG: "tr" }), { provider: "piper", model: "tr_TR-dfki-medium" });

  const elCfg = { provider: "elevenlabs", voiceId: "v-en", voices: { tr: "v-tr" } };
  assert.deepEqual(resolveVoiceSettings(elCfg, { LANG: "tr" }), { provider: "elevenlabs", voiceId: "v-tr" });

  const objCfg = { provider: "edge-tts", voices: { tr: { voice: "tr-TR-AhmetNeural", speed: 1.08 } } };
  assert.deepEqual(resolveVoiceSettings(objCfg, { LANG: "tr" }), { provider: "edge-tts", voice: "tr-TR-AhmetNeural", speed: 1.08 });
});

test("resolveMusicTrack and musicFfmpegArgs", () => {
  const home = mkdtempSync(join(tmpdir(), "pw-music-"));
  const videoDir = join(home, "vid");
  mkdirSync(join(home, "music"), { recursive: true });
  mkdirSync(join(videoDir, "assets"), { recursive: true });
  const homeTrack = join(home, "music", "calm.wav");
  const localTrack = join(videoDir, "assets", "bed.mp3");
  writeFileSync(homeTrack, "wav");
  writeFileSync(localTrack, "mp3");

  assert.equal(resolveMusicTrack(null, { home, videoDir }), null);
  assert.equal(resolveMusicTrack("", { home, videoDir }), null);
  assert.equal(resolveMusicTrack("synth", { home, videoDir }), null);
  assert.equal(resolveMusicTrack("calm", { home, videoDir }), homeTrack);
  assert.equal(resolveMusicTrack("calm.wav", { home, videoDir }), homeTrack);
  assert.equal(resolveMusicTrack("assets/bed.mp3", { home, videoDir }), localTrack);
  assert.equal(resolveMusicTrack(homeTrack, { home, videoDir }), homeTrack);
  assert.throws(() => resolveMusicTrack("../music/calm.wav", { home: "", videoDir }), /music track not found/);
  assert.throws(() => resolveMusicTrack("missing.mp3", { home, videoDir }), /music track not found/);

  const args = musicFfmpegArgs(homeTrack, "/tmp/out.wav", { duration: 14, offset: 3.5 });
  assert.ok(args.includes("-stream_loop"));
  assert.ok(args.includes("-ss") && args[args.indexOf("-ss") + 1] === "3.5");
  assert.ok(args.includes("-t") && args[args.indexOf("-t") + 1] === "14");
  const af = args[args.indexOf("-af") + 1];
  assert.match(af, /loudnorm=I=-16:TP=-1\.5:LRA=11/);
  assert.match(af, /afade=t=in:st=0:d=0\.4/);
  assert.match(af, /afade=t=out:st=13\.2:d=0\.8/);

  const argsNoOffset = musicFfmpegArgs(homeTrack, "/tmp/out.wav", { duration: 10, offset: 0 });
  assert.equal(argsNoOffset.includes("-ss"), false);
  assert.throws(() => musicFfmpegArgs(homeTrack, "/tmp/out.wav", { duration: 0 }), /invalid video DURATION/);
  assert.throws(() => musicFfmpegArgs(homeTrack, "/tmp/out.wav", { duration: 10, offset: -1 }), /invalid MUSIC_OFFSET/);
});

test("edgeTtsPcm retries transient NoAudioReceived, cleans stderr, and fails fast on ENOENT", async () => {
  assert.equal(
    cleanStderr("  0%|          | 0/10\r100%|####| 10/10\nNoAudioReceived: No audio was received.\n"),
    "NoAudioReceived: No audio was received.",
  );

  // Fails twice with NoAudioReceived, succeeds on attempt 3
  let edgeCalls = 0;
  const slept = [];
  const res = await edgeTtsPcm({ voice: "tr-TR-AhmetNeural", speed: 1.05 }, "Merhaba", {
    delays: [1500, 3000, 4500],
    sleep: async (ms) => slept.push(ms),
    run(cmd, args, opts) {
      assert.deepEqual(opts.stdio, ["pipe", "pipe", "pipe"]);
      if (cmd === "edge-tts") {
        edgeCalls++;
        if (edgeCalls < 3) {
          const err = new Error("Command failed");
          err.stderr = Buffer.from("0%| |\rNoAudioReceived: No audio was received.\n");
          throw err;
        }
        return Buffer.from("fake-mp3");
      }
      return Buffer.alloc(4800, 1);
    },
  });
  assert.equal(edgeCalls, 3);
  assert.deepEqual(slept, [1500, 3000]);
  assert.equal(res.rateHz, 24000);
  assert.equal(res.pcm.length, 4800);

  // Exhausts all retries and reports cleaned stderr
  let attempts = 0;
  await assert.rejects(
    () => edgeTtsPcm({ voice: "en-US-AndrewNeural" }, "Hi", {
      delays: [10, 20, 30],
      sleep: async () => {},
      run() {
        attempts++;
        const err = new Error("Command failed");
        err.stderr = Buffer.from("50%|###|\rNoAudioReceived: transient\n");
        throw err;
      },
    }),
    /Edge TTS failed after 4 attempts: NoAudioReceived: transient/,
  );
  assert.equal(attempts, 4);

  // Fails immediately on ENOENT without retrying
  let enoentCalls = 0;
  await assert.rejects(
    () => edgeTtsPcm({ voice: "en-US-AndrewNeural" }, "Hi", {
      delays: [10, 20],
      sleep: async () => { throw new Error("should not sleep on ENOENT"); },
      run() {
        enoentCalls++;
        const err = new Error("spawn edge-tts ENOENT");
        err.code = "ENOENT";
        throw err;
      },
    }),
    /Install edge-tts/,
  );
  assert.equal(enoentCalls, 1);

  await assert.rejects(() => edgeTtsPcm({ speed: 0 }, "Hi"), /voice\.speed/);
});

test("video/music.mjs real track + video/mix.mjs balanced default MUSIC_LEVEL", (t) => {
  const ff = process.env.FFMPEG || "ffmpeg";
  if (spawnSync(ff, ["-version"], { stdio: "ignore" }).status !== 0) {
    t.skip("ffmpeg not available on PATH (set FFMPEG to run)");
    return;
  }
  const home = mkdtempSync(join(tmpdir(), "pw-real-music-"));
  const vdir = join(home, "clip");
  mkdirSync(join(home, "music"), { recursive: true });
  mkdirSync(join(vdir, "voice"), { recursive: true });
  writeFileSync(join(home, "config.json"), JSON.stringify({ timezone: "UTC", video: { musicTrack: "bed.wav" } }));
  writeFileSync(join(home, "music", "bed.wav"), makeWav(2));
  writeFileSync(join(vdir, "voice", "0.wav"), makeWav(1, 24000, 1));
  writeFileSync(join(vdir, "timeline.mjs"), [
    'export const DURATION = 5, BEAT = 0.5, MUSIC_OFFSET = 0.5;',
    'export const LINES = [{ at: 0.2, until: 2.0, text: "Hello" }];',
  ].join("\n"));

  const env = { ...process.env, POSTWEFT_HOME: home, FFMPEG: ff };
  execFileSync("node", ["video/music.mjs", join(vdir, "timeline.mjs")], { env, stdio: "pipe" });
  const wavBuf = readFileSync(join(vdir, "music.wav"));
  assert.equal(wavBuf.toString("ascii", 0, 4), "RIFF");
  assert.equal(wavBuf.readUInt16LE(22), 2);
  assert.equal(wavBuf.readUInt32LE(24), 44100);
  // 5 seconds at 44100 Hz stereo 16-bit = ~882,000 bytes
  assert.ok(wavBuf.length > 800000 && wavBuf.length < 950000, `unexpected wav size: ${wavBuf.length}`);

  execFileSync("node", ["video/mix.mjs", vdir], { env, stdio: "pipe" });
  assert.ok(existsSync(join(vdir, "audio.wav")));
  const mixArgs = JSON.parse(readFileSync(join(vdir, "mix.args.json"), "utf8"));
  const fc = mixArgs[mixArgs.indexOf("-filter_complex") + 1];
  assert.match(fc, /0\.26/);

  // Explicit MUSIC_TRACK = "synth" falls back to built-in synthesizer despite config.video.musicTrack
  writeFileSync(join(vdir, "timeline.mjs"), 'export const DURATION = 2, BEAT = 0.5, MUSIC_TRACK = "synth";\n');
  const synthOut = execFileSync("node", ["video/music.mjs", join(vdir, "timeline.mjs")], { env, encoding: "utf8", stdio: "pipe" });
  assert.match(synthOut, /music\.wav written, peak/);
});

test("setup-check.mjs content-only mode marks platforms and unused reply AI as optional", () => {
  const home = mkdtempSync(join(tmpdir(), "pw-content-only-"));
  mkdirSync(join(home, "music"), { recursive: true });
  writeFileSync(join(home, "music", "theme.wav"), "wav");
  writeFileSync(join(home, "brand.md"), "# Acme\nHandmade ceramics.\n");
  writeFileSync(join(home, "config.json"), JSON.stringify({
    timezone: "UTC",
    brand: { name: "Acme", language: "English", factsFile: "brand.md", allowedLinks: ["acme.test"] },
    voice: { provider: "none" },
    video: { musicTrack: "theme.wav" },
    ai: { provider: "gemini" }, // no GEMINI_API_KEY, should still be optional in content-only mode
  }));

  const res = spawnSync("node", ["bin/setup-check.mjs"], {
    env: { ...process.env, POSTWEFT_HOME: home },
    encoding: "utf8",
  });
  assert.match(res.stdout, /optional\s+platforms\s+->\s+content-only mode/);
  assert.match(res.stdout, /optional\s+reply AI\s+->\s+unused in content-only mode/);
  assert.match(res.stdout, /optional\s+slots\.json/);
  assert.match(res.stdout, /optional\s+\.env/);
  assert.match(res.stdout, /ok\s+music track: theme\.wav/);
  if (spawnSync(process.env.FFMPEG || "ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) {
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Setup complete \(content-only mode\)/);
  }
});
