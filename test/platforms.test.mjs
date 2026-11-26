import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const home = mkdtempSync(join(tmpdir(), "sa-"));
writeFileSync(join(home, "config.json"), JSON.stringify({ timezone: "UTC" }));
writeFileSync(join(home, "slots.json"), JSON.stringify({
  instagram: { reel: { minGapMinutes: 60, maxPerDay: 2, days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [["18:00", "20:00"]]])) } },
  threads: { minGapMinutes: 60, maxPerDay: 2, days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [["18:00", "20:00"]]])) },
}));
writeFileSync(join(home, ".env"), "A=1\nTHREADS_TOKEN=old\n");
process.env.POSTWEFT_HOME = home;
const { chunkPlan } = await import("../lib/tiktok.mjs");
const { ytTitle, ytDescription } = await import("../lib/youtube.mjs");
const { setEnvValue } = await import("../lib/envfile.mjs");
const { captionProblem } = await import("../lib/text.mjs");
const { trialParams, createContainer } = await import("../lib/meta.mjs");
const { rule } = await import("../lib/slots.mjs");

const MB = 1024 * 1024;
test("tiktok chunks: one piece up to 64 MB, 10 MB pieces above, last piece takes the rest", () => {
  assert.deepEqual(chunkPlan(3 * MB), { chunk_size: 3 * MB, total_chunk_count: 1 });
  assert.deepEqual(chunkPlan(64 * MB), { chunk_size: 64 * MB, total_chunk_count: 1 });
  const p = chunkPlan(105 * MB);
  assert.deepEqual(p, { chunk_size: 10 * MB, total_chunk_count: 10 });
  assert.ok(105 * MB - 9 * p.chunk_size < 2 * p.chunk_size); // last piece is under 20 MB
});

test("youtube title and description are cleaned and cut to the limits", () => {
  assert.equal(ytTitle("  a <b>\n c  "), "a b c");
  assert.equal([...ytTitle("x".repeat(150))].length, 100);
  assert.ok(Buffer.byteLength(ytDescription("ş".repeat(4000))) <= 5000);
});

test("setEnvValue replaces or adds a line and keeps the file private", () => {
  setEnvValue("THREADS_TOKEN", "new$&value");
  setEnvValue("TIKTOK_REFRESH_TOKEN", "r1");
  assert.equal(readFileSync(join(home, ".env"), "utf8"), "A=1\nTHREADS_TOKEN=new$&value\nTIKTOK_REFRESH_TOKEN=r1\n");
  assert.equal(statSync(join(home, ".env")).mode & 0o777, 0o600);
  assert.throws(() => setEnvValue("X", "a\nb"));
});

test("caption limits for every platform", () => {
  assert.match(captionProblem("tiktok", "x".repeat(2201)), /limit is 2200/);
  assert.equal(captionProblem("youtube", "x".repeat(5000)), "");
});

test("instagram trial reels: strategy mapping, slot fallback and queue-add validation", async () => {
  assert.equal(trialParams(undefined), null);
  assert.deepEqual(trialParams("manual"), { graduation_strategy: "MANUAL" });
  assert.deepEqual(trialParams("MANUAL"), { graduation_strategy: "MANUAL" });
  assert.deepEqual(trialParams("auto"), { graduation_strategy: "SS_PERFORMANCE" });
  assert.deepEqual(trialParams("SS_PERFORMANCE"), { graduation_strategy: "SS_PERFORMANCE" });
  assert.throws(() => trialParams("other"), /invalid trial mode/);
  await assert.rejects(() => createContainer("threads", "video", { trial: "manual" }), /only supported for Instagram reels/);
  await assert.rejects(() => createContainer("instagram", "image", { trial: "manual" }), /only supported for Instagram reels/);
  assert.deepEqual(rule("instagram", "trial_reel"), rule("instagram", "reel"));

  const video = join(home, "clip.mp4");
  writeFileSync(video, "fake");
  const run = (args) => execFileSync("node", ["bin/queue-add.mjs", ...args], { env: { ...process.env, POSTWEFT_HOME: home }, encoding: "utf8", stdio: "pipe" });
  const manual = JSON.parse(run(["--platform", "instagram", "--video", video, "--caption", "hook a", "--trial", "--dry"]));
  assert.equal(manual.trial, "manual");
  const auto = JSON.parse(run(["--platform", "instagram", "--video", video, "--caption", "hook b", "--trial", "auto", "--dry"]));
  assert.equal(auto.trial, "auto");
  assert.throws(() => run(["--platform", "threads", "--caption", "hi", "--trial", "--dry"]), /only supported for Instagram Reels/);
  assert.throws(() => run(["--platform", "instagram", "--video", video, "--caption", "hi", "--trial", "bad", "--dry"]), /"manual" or "auto"/);
});
