// Procedural background music + sound effects in one track (no samples, no licenses): 120 BPM pop loop with two
// chord progressions, "la" (Am-F-C-G) and "fa" (F-C-Dm-Bb). Effects are in the same key and the same reverb room.
// Usage: node music.mjs <video>/timeline.mjs   -> <video>/music.wav (44.1 kHz, 16 bit, stereo)
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const T = await import(pathToFileURL(process.argv[2]).href);

const SR = 44100;
const N = Math.round(SR * T.DURATION);
const L = new Float32Array(N);
const R = new Float32Array(N);
const busRev = new Float32Array(N); // reverb send (mono)
const duck = new Float32Array(N).fill(1); // ducking envelope from the kick

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const BEAT = T.BEAT;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function add(start, buf, gain = 1, pan = 0, rev = 0) {
  const s0 = Math.round(start * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < buf.length; i++) {
    const j = s0 + i;
    if (j < 0 || j >= N) continue;
    L[j] += buf[i] * gl;
    R[j] += buf[i] * gr;
    busRev[j] += buf[i] * gain * rev;
  }
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// ---- Instruments ----
function kick() {
  const len = Math.round(0.35 * SR), b = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, f = 45 + 95 * Math.exp(-t / 0.045);
    ph += (2 * Math.PI * f) / SR;
    b[i] = Math.sin(ph) * env(t, 0.002, 0.11) + (i < 60 ? rnd() * 0.15 : 0);
  }
  return b;
}
function noiseHit(dur, decay, hp = 0.9, lpc = 0.5) {
  const len = Math.round(dur * SR), b = new Float32Array(len);
  let prev = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const n = rnd(); const h = n - prev * hp; prev = n; lp += (h - lp) * lpc;
    b[i] = lp * env(i / SR, 0.001, decay);
  }
  return b;
}
function clap() {
  const b = noiseHit(0.25, 0.06, 0.6, 0.22);
  for (let i = 0; i < b.length; i++) { const t = i / SR; if (t < 0.03) b[i] *= t % 0.01 < 0.004 ? 1 : 0.3; }
  return b;
}
function tone(freq, dur, { a = 0.005, d = 0.3, harm = [1], vib = 0 } = {}) {
  const len = Math.round(dur * SR), b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR; let s = 0;
    harm.forEach((g, k) => (s += (g * Math.sin(2 * Math.PI * freq * (k + 1) * t + vib * Math.sin(2 * Math.PI * 5 * t)))));
    b[i] = s * env(t, a, d) * Math.min(1, (dur - t) / 0.02);
  }
  return b;
}
function pluck(freq, dur = 0.5) {
  // Karplus–Strong
  const len = Math.round(dur * SR), b = new Float32Array(len);
  const p = Math.max(2, Math.round(SR / freq)); const buf = new Float32Array(p).map(() => rnd() * 0.8);
  for (let i = 0; i < len; i++) { const k = i % p; const nx = (k + 1) % p; const v = buf[k]; buf[k] = 0.497 * (v + buf[nx]); b[i] = v; }
  return b;
}
function whoosh(dur) {
  const len = Math.round(dur * SR), b = new Float32Array(len);
  let lp = 0;
  for (let i = 0; i < len; i++) { const t = i / SR, x = t / dur; const cut = 0.02 + 0.25 * x * x; lp += (rnd() - lp) * cut; b[i] = lp * Math.sin(Math.PI * x) ** 2; }
  return b;
}

// ---- Harmony ----
const PROGS = {
  la: { CH: { Am: [57, 60, 64], F: [53, 57, 60], C: [48, 55, 60, 64], G: [55, 59, 62] }, ROOT: { Am: 45, F: 41, C: 48, G: 43 },
        BARS: ["Am", "F", "C", "G", "Am", "F", "C", "G", "F", "C"], END: [48, 55, 60, 64, 67] },
  fa: { CH: { F: [53, 57, 60], C: [55, 60, 64], Dm: [53, 57, 62], Bb: [53, 58, 62] }, ROOT: { F: 41, C: 48, Dm: 50, Bb: 46 },
        BARS: ["F", "C", "Dm", "Bb", "F", "C", "Dm", "Bb", "C", "F"], END: [41, 48, 53, 57, 60] },
};
const { CH, ROOT, END } = PROGS[T.PROG ?? "fa"];
// Videos longer than 20 s repeat the main loop (first 8 bars) and end with the same 2-bar ending.
// A 20 s video gets exactly 10 bars (DUR=20 -> FIN=19).
const DUR = T.DURATION, FIN = DUR - 1.0, OLCU = Math.round(DUR / 2), B0 = PROGS[T.PROG ?? "fa"].BARS;
const BARS = OLCU <= B0.length ? B0 : [...Array.from({ length: OLCU - 2 }, (_, i) => B0[i % 8]), ...B0.slice(-2)];
const chordAt = (t) => BARS[Math.min(BARS.length - 1, Math.floor(t / 2))];

const K = kick(), CL = clap();
for (let b = 0; b < DUR / BEAT; b++) {
  const t = b * BEAT, bar = Math.floor(b / 4), inBar = b % 4;
  const end = t >= FIN; // last half bar: only the chord rings
  // Kick on 1 and 3 (only 1 in the first bar)
  if (!end && (inBar === 0 || (inBar === 2 && bar > 0))) {
    add(t, K, 0.9);
    const s0 = Math.round(t * SR);
    for (let i = 0; i < SR * 0.3; i++) if (s0 + i < N) duck[s0 + i] = Math.min(duck[s0 + i], 0.35 + 0.65 * (i / (SR * 0.3)));
  }
  if (!end && bar > 0 && (inBar === 1 || inBar === 3)) add(t, CL, 0.32, 0.1, 0.25);
  // Hi-hat eighths (not in the first bar)
  if (!end && bar > 0) for (const off of [0, 0.25]) add(t + off, noiseHit(0.05, 0.012, 0.9, 0.45), off ? 0.07 : 0.045, -0.3);
}
// Bass: eighths on the root
for (let s = 0; s < (DUR * 2) / BEAT; s++) {
  const t = s * BEAT / 2; if (t >= FIN) break;
  if (t < 2 && s % 2) continue; // sparse in the intro
  const c = chordAt(t); const f = hz(ROOT[c] + (s % 4 === 3 ? 12 : 0));
  add(t, tone(f, 0.24, { a: 0.004, d: 0.12, harm: [1, 0.5, 0.25, 0.12] }), 0.28);
}
// Pad: soft chords
for (let bar = 0; bar < OLCU; bar++) {
  const c = BARS[bar]; const dur = bar === OLCU - 1 ? 2.0 : 2.05;
  CH[c].forEach((m, i) => add(bar * 2, tone(hz(m + 12), dur, { a: 0.25, d: 3, harm: [1, 0.2] }), 0.035, i % 2 ? 0.4 : -0.4, 0.4));
}
// Pluck arpeggio: sixteenths, chord tones
for (let s = 0; s < (FIN * 4) / BEAT; s++) {
  const t = s * BEAT / 4; if (t < 2 || t >= FIN) continue;
  const c = CH[chordAt(t)]; const m = c[s % c.length] + 12 + (s % 8 >= 4 ? 12 : 0);
  add(t, pluck(hz(m), 0.4), 0.16, s % 2 ? 0.35 : -0.35, 0.35);
}
// Final chord: rings out
END.forEach((m, i) => add(FIN, tone(hz(m + 12), 1.0, { a: 0.01, d: 0.6, harm: [1, 0.3] }), 0.09, (i - 2) * 0.2, 0.5));
add(FIN, K, 0.7);

// ---- Effects (in key, under the music); times come from timeline.mjs ----
const top = (t, k) => { const c = CH[chordAt(t + 0.01)]; return c[k % c.length] + 24; }; // chord tone, two octaves up
for (const t of T.POPS ?? []) add(t, tone(hz(top(t, Math.round(t * 4))), 0.18, { a: 0.002, d: 0.05, harm: [1, 0.15] }), 0.11, 0.15, 0.3);
for (const t of T.STAMPS ?? []) { add(t, K, 0.45); add(t, noiseHit(0.08, 0.02, 0.9, 0.15), 0.1, 0, 0.2); }
for (const t of T.TAPS ?? []) add(t, noiseHit(0.03, 0.006, 0.97), 0.16, 0.2);
for (const t of T.CUTS ?? []) add(t - 0.3, whoosh(0.32), 0.09, 0, 0.3);
// Typing: tiny click per letter. TYPES: [[start, end, letters], ...]
for (const [s0, e0, n] of T.TYPES ?? []) for (let i = 0; i < n; i++) add(s0 + (i * (e0 - s0)) / n, noiseHit(0.02, 0.004, 0.98), 0.045, 0.25);
// Rising tone (loading, scanning): RISES: [[start, end], ...]
for (const [s0, e0] of T.RISES ?? []) {
  const dur = e0 - s0, len = Math.round(dur * SR), b = new Float32Array(len); let ph = 0;
  const base = CH[chordAt(s0)][0] + 12;
  for (let i = 0; i < len; i++) { const x = i / len; ph += (2 * Math.PI * hz(base + 12 * x)) / SR; b[i] = Math.sin(ph) * Math.sin(Math.PI * x) * 0.5; }
  add(s0, b, 0.05, 0, 0.3);
}
// Notification bell: two chord tones with bell harmonics. BELLS: [t, ...]
for (const t of T.BELLS ?? []) [top(t, 1) + 12, top(t, 2) + 12].forEach((m, i) => add(t + i * BEAT / 4, tone(hz(m), 0.9, { a: 0.002, d: 0.35, harm: [1, 0, 0.35, 0, 0.12] }), 0.07, 0.1, 0.45));
// Success: high chord arpeggio. SUCCESS: [t, ...]
for (const t of T.SUCCESS ?? []) { const c = CH[chordAt(t)]; [c[0] + 24, c[1] + 24, c[2] + 24, c[0] + 36].forEach((m, i) => add(t + i * BEAT / 4, tone(hz(m), 0.35, { a: 0.003, d: 0.12, harm: [1, 0.2] }), 0.065, 0.1, 0.4)); }

// ---- Ducking, reverb, mastering ----
// Light ducking against the kick (pumping feel)
for (let i = 0; i < N; i++) { const g = 0.8 + 0.2 * duck[i]; L[i] *= g; R[i] *= g; }
// Simple room reverb: four comb filters
const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
for (let i = 0; i < N; i++) {
  let s = 0;
  for (const c of combs) { const y = c.buf[c.i]; c.buf[c.i] = busRev[i] + y * 0.78; c.i = (c.i + 1) % c.d; s += y; }
  L[i] += s * 0.05; R[i] += s * 0.05 * (i % 2 ? 1 : 0.96);
}
// Soft limiter + fade out in the last 0.6 s + normalize
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = t > T.DURATION - 0.6 ? (T.DURATION - t) / 0.6 : 1, fin = Math.min(1, t / 0.01);
  L[i] = Math.tanh(L[i] * 1.2) * fade * fin; R[i] = Math.tanh(R[i] * 1.2) * fade * fin;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4); }
writeFileSync(new URL("./music.wav", pathToFileURL(process.argv[2])), out);
console.log("music.wav written, peak", peak.toFixed(2));
