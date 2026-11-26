import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const callback = "http://127.0.0.1:8765/callback";

function fixture(t, values, mock) {
  const home = mkdtempSync(join(tmpdir(), "sa-x-auth-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = { ...process.env, POSTWEFT_HOME: home };
  for (const key of ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REFRESH_TOKEN"]) delete env[key];
  const preload = join(home, "mock.mjs");
  writeFileSync(join(home, "config.json"), JSON.stringify({ x: { redirectUri: callback } }));
  writeFileSync(join(home, ".env"), "X_CLIENT_ID=test-id\n" + values);
  writeFileSync(preload, mock);
  return { home, env, run: (...args) => exec(process.execPath, ["--import", preload, ...args], { env }) };
}

test("X connect verifies the callback and exchanges the code with S256 PKCE", async (t) => {
  const mock = `
    import assert from "node:assert/strict";
    import { createHash } from "node:crypto";
    globalThis.fetch = async (url, { body, headers, method }) => {
      assert.equal(url, "https://api.x.com/2/oauth2/token");
      assert.equal(method, "POST");
      assert.equal(headers.authorization, "Basic " + Buffer.from("test-id:test-secret").toString("base64"));
      assert.equal(body.has("client_id"), false);
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), ${JSON.stringify(callback)});
      assert.equal(body.get("code"), "test-code");
      assert.equal(createHash("sha256").update(body.get("code_verifier")).digest("base64url"), process.env.X_TEST_CHALLENGE);
      return Response.json({ access_token: "test-access", refresh_token: "test-refresh" });
    };
  `;
  const { home, env, run } = fixture(t, "X_CLIENT_SECRET=test-secret\n", mock);
  const connect = (...args) => run("bin/connect.mjs", "x", ...args);
  const { stdout } = await connect();
  const auth = new URL(stdout.match(/https:\/\/x\.com\/\S+/)[0]);
  assert.equal(auth.searchParams.get("redirect_uri"), callback);
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("scope"), "tweet.read tweet.write users.read offline.access");
  env.X_TEST_CHALLENGE = auth.searchParams.get("code_challenge");
  const state = auth.searchParams.get("state");
  await assert.rejects(connect(`https://example.test/callback?code=test-code&state=${state}`), (e) => /registered X callback/.test(e.stderr));
  await assert.rejects(connect(`${callback}?code=test-code&state=wrong`), (e) => /another sign-in attempt/.test(e.stderr));
  const result = await connect(`${callback}?code=test-code&state=${state}`);
  assert.match(result.stdout, /X connected/);
  assert.doesNotMatch(result.stdout + result.stderr, /test-(code|secret|access|refresh)/);
  assert.match(readFileSync(join(home, ".env"), "utf8"), /^X_REFRESH_TOKEN=test-refresh$/m);
  assert.equal(existsSync(join(home, "state", "connect-x.json")), false);
});

test("concurrent X refreshes use each rotating token once", async (t) => {
  const mock = `
    import assert from "node:assert/strict";
    import { appendFileSync, existsSync, readFileSync } from "node:fs";
    import { join } from "node:path";
    import { setTimeout as delay } from "node:timers/promises";
    const calls = join(process.env.POSTWEFT_HOME, "calls");
    globalThis.fetch = async (url, { body, headers }) => {
      assert.equal(url, "https://api.x.com/2/oauth2/token");
      assert.equal(body.get("grant_type"), "refresh_token");
      assert.equal(body.get("client_id"), "test-id");
      assert.equal(headers.authorization, undefined);
      const count = existsSync(calls) ? readFileSync(calls, "utf8").length : 0;
      assert.equal(body.get("refresh_token"), "test-refresh-" + count);
      appendFileSync(calls, "x");
      await delay(300);
      return Response.json({ access_token: "test-access", refresh_token: "test-refresh-" + (count + 1) });
    };
  `;
  const { home, run } = fixture(t, "X_REFRESH_TOKEN=test-refresh-0\n", mock);
  const refresh = () => run("--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { xAccessToken } from "./lib/x.mjs";
    assert.deepEqual(await Promise.all([xAccessToken(), xAccessToken()]), ["test-access", "test-access"]);
    assert.equal(await xAccessToken(), "test-access");
  `);
  await Promise.all([refresh(), refresh()]);
  assert.equal(readFileSync(join(home, "calls"), "utf8"), "xx");
  assert.match(readFileSync(join(home, ".env"), "utf8"), /^X_REFRESH_TOKEN=test-refresh-2$/m);
});
