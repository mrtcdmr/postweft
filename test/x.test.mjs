import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const postUrl = "https://api.x.com/2/tweets";
const postLink = "https://x.com/i/web/status/1234567";
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString().slice(0, 16);

function fixture(t, postStatus = 201) {
  const home = mkdtempSync(join(tmpdir(), "sa-x-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const queue = join(home, "queue");
  const calls = join(home, "calls.jsonl");
  const mock = join(home, "fetch.mjs");
  writeFileSync(join(home, "config.json"), JSON.stringify({
    timezone: "UTC",
    x: { redirectUri: "http://127.0.0.1:8765/callback" },
  }));
  writeFileSync(join(home, ".env"), "X_CLIENT_ID=example-client\nX_REFRESH_TOKEN=example-refresh\n", { mode: 0o600 });
  writeFileSync(calls, "");
  writeFileSync(mock, `
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url === "https://api.x.com/2/oauth2/token") {
    assert.equal(options.method, "POST");
    assert.equal(new URLSearchParams(options.body).get("grant_type"), "refresh_token");
    appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ url }) + "\\n");
    return Response.json({ access_token: "example-access", refresh_token: "example-rotated", expires_in: 7200 });
  }
  assert.equal(url, ${JSON.stringify(postUrl)}, "unexpected request");
  assert.equal(options.method, "POST");
  assert.equal(new Headers(options.headers).get("authorization"), "Bearer example-access");
  appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ url, body: JSON.parse(options.body) }) + "\\n");
  return Response.json(${postStatus === 201 ? '{ data: { id: "1234567" } }' : '{ title: "Unavailable" }'}, { status: ${postStatus} });
};`);

  const env = { ...process.env, POSTWEFT_HOME: home };
  for (const key of ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REFRESH_TOKEN"]) delete env[key];
  const run = (file, args, expect = 0) => {
    const result = spawnSync(process.execPath, ["--import", mock, `bin/${file}.mjs`, ...args], {
      cwd: repo, env, encoding: "utf8", timeout: 15_000,
    });
    assert.ifError(result.error);
    if (expect !== null) assert.equal(result.status, expect, result.stderr);
    return result;
  };
  return {
    queue,
    add: (caption, at, ...args) => run("queue-add", ["--platform", "x", "--caption", caption, "--at", at, ...args], null),
    publish: () => run("publish-queue", []),
    summary: () => run("summary", ["--print"]).stdout,
    calls: () => readFileSync(calls, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)),
  };
}

test("X dry preview shows the intended post and estimates URL pricing without queueing", (t) => {
  const x = fixture(t);
  const at = minutesFromNow(30);
  const plain = x.add("Hello", at, "--dry");
  assert.equal(plain.status, 0, plain.stderr);
  const preview = JSON.parse(plain.stdout);
  assert.equal(preview.estimatedPublishCostUsd, 0.015);
  assert.equal(preview.caption, "Hello");
  assert.equal(preview.at, at);

  const caption = `See https://example.com/${"x".repeat(300)}`;
  const linked = x.add(caption, at, "--dry");
  assert.equal(linked.status, 0, linked.stderr);
  assert.equal(JSON.parse(linked.stdout).estimatedPublishCostUsd, 0.2);
  assert.equal(x.add("界".repeat(141), at, "--dry").status, 1);
  assert.equal(x.add("Hello", at, "--image", "https://example.com/photo.jpg", "--dry").status, 1);
  assert.deepEqual(readdirSync(x.queue), []);
  assert.deepEqual(x.calls(), []);
});

test("X publishes due text once and shows the resulting link in the summary", (t) => {
  const x = fixture(t);
  const text = "Read the update at https://example.com/news";
  for (const [caption, at] of [[text, minutesFromNow(-5)], ["Later", minutesFromNow(30)]]) {
    const added = x.add(caption, at);
    assert.equal(added.status, 0, added.stderr);
  }
  x.publish();
  x.publish();
  assert.deepEqual(x.calls(), [{ url: "https://api.x.com/2/oauth2/token" }, { url: postUrl, body: { text } }]);
  assert.ok(x.summary().includes(`x text ${postLink}`));
});

test("X does not automatically retry when the publication result is unknown", (t) => {
  const x = fixture(t, 500);
  const added = x.add("Hello", minutesFromNow(-5));
  assert.equal(added.status, 0, added.stderr);
  x.publish();
  x.publish();
  assert.deepEqual(x.calls(), [{ url: "https://api.x.com/2/oauth2/token" }, { url: postUrl, body: { text: "Hello" } }]);
  assert.match(x.summary(), /Problems: 1/);
});
