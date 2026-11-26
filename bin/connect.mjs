#!/usr/bin/env node
// Connects a YouTube, TikTok or X account (official sign-in, OAuth). The refresh token is written into .env and is
// never printed.
//   node bin/connect.mjs youtube|tiktok|x          prints the sign-in link; in a terminal it then waits
//   node bin/connect.mjs youtube|tiktok|x "<url>"  finishes with the address the browser ended on after "Allow"
// After allowing access the browser goes to the redirect address. On the same computer this finishes by itself
// for local callbacks. Otherwise the page may not load: copy the whole address from the address bar and paste it
// in the terminal. That address holds a short-lived, one-time code; the tokens stay on this machine.
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import { config, env, loadState, statePath } from "../lib/config.mjs";
import { setEnvValue } from "../lib/envfile.mjs";
import { YT_SCOPES, googleToken, yt } from "../lib/youtube.mjs";
import { tiktokToken } from "../lib/tiktok.mjs";
import { xAuthorizeUrl, xToken } from "../lib/x.mjs";

const [service, pasted] = process.argv.slice(2);
const fail = (m) => { console.error(m); process.exit(1); };
const accounts = new Map([
  ["youtube", { keys: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"], name: "YouTube channel's Google account" }],
  ["tiktok", { keys: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], name: "TikTok account" }],
  ["x", { keys: ["X_CLIENT_ID"], name: "X account" }],
]);
const account = accounts.get(service);
if (!account) fail("usage: node bin/connect.mjs youtube|tiktok|x [\"<address after Allow>\"]");
const need = account.keys;
for (const k of need) if (!env[k]) fail(`${k} is empty in .env: create the app first (see the setup guide), then put its keys in .env yourself.`);
const pendingFile = statePath("connect-" + service);
const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const lifetime = 15 * 60e3;
const matchesRedirect = (url, expected) => url.origin === expected.origin && url.pathname === expected.pathname;
let finishing = false;

async function finish(address, pending) {
  if (finishing) return;
  let u;
  try { u = new URL(address.trim()); } catch { fail("That is not an address. Copy the whole address from the browser's address bar."); }
  if (!pending || Date.now() - pending.at > lifetime) fail("No recent sign-in was started here (or it is older than 15 minutes). Run: node bin/connect.mjs " + service);
  if (service === "x" && !matchesRedirect(u, new URL(pending.redirect))) fail("That address does not match the registered X callback. Copy the address after pressing Allow.");
  if (u.searchParams.get("error")) fail(service === "x" ? "X sign-in was cancelled or refused." : `Sign-in was cancelled or refused: ${u.searchParams.get("error_description") || u.searchParams.get("error")}`);
  const code = u.searchParams.get("code");
  if (!code) fail("No code in that address. Copy it right after pressing Allow.");
  if (u.searchParams.get("state") !== pending.state) fail("This address belongs to another sign-in attempt. Start again: node bin/connect.mjs " + service);
  finishing = true;
  if (service === "youtube") {
    const j = await googleToken({ grant_type: "authorization_code", code, redirect_uri: pending.redirect, code_verifier: pending.verifier });
    if (!j.refresh_token) fail("Google returned no refresh token. Remove the app's access at myaccount.google.com/permissions and connect again.");
    setEnvValue("YOUTUBE_REFRESH_TOKEN", j.refresh_token);
    let name = "";
    try { name = (await yt("GET", "/channels", { part: "snippet", mine: "true" })).items?.[0]?.snippet?.title || ""; } catch { /* shown below */ }
    console.log(`YouTube connected${name ? ` (channel: ${name})` : ""}. The token is saved in .env.`);
  } else if (service === "tiktok") {
    const j = await tiktokToken({ grant_type: "authorization_code", code, redirect_uri: pending.redirect });
    setEnvValue("TIKTOK_REFRESH_TOKEN", j.refresh_token);
    let name = "";
    try {
      const r = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name", { headers: { authorization: "Bearer " + j.access_token } });
      name = (await r.json()).data?.user?.display_name || "";
    } catch { /* optional */ }
    console.log(`TikTok connected${name ? ` (account: ${name})` : ""}. The token is saved in .env; it is renewed automatically.`);
  } else {
    const grant = await xToken({ grant_type: "authorization_code", code, redirect_uri: pending.redirect, code_verifier: pending.verifier });
    if (!grant.refresh_token) fail("X returned no refresh token. Enable offline access and connect again.");
    setEnvValue("X_REFRESH_TOKEN", grant.refresh_token);
    console.log("X connected. The token is saved in .env and renewed automatically.");
  }
  rmSync(pendingFile, { force: true });
  process.exit(0);
}

// Step 2: an address was passed in
if (pasted) {
  const pending = loadState("connect-" + service, null);
  await finish(pasted, pending).catch((e) => fail(e.message));
}

// Step 1: build the sign-in link
const state = b64url(randomBytes(18));
let redirect, link, verifier;
if (service === "youtube") {
  verifier = b64url(randomBytes(48));
  const port = Number(config.youtube?.redirectPort || 8765);
  redirect = `http://127.0.0.1:${port}`;
  link = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: YT_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", state, code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
  });
} else if (service === "tiktok") {
  redirect = config.tiktok?.redirectUri;
  if (!redirect) fail('Set tiktok.redirectUri in config.json to the redirect address registered in your TikTok app (for example "https://example.com/tiktok-callback").');
  link = "https://www.tiktok.com/v2/auth/authorize/?" + new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY, scope: "user.info.basic,video.upload", response_type: "code", redirect_uri: redirect, state,
  });
} else {
  redirect = config.x?.redirectUri;
  const guidance = 'Set x.redirectUri in config.json to the exact callback registered in the X app (for example "http://127.0.0.1:8765/callback").';
  let callback;
  try { callback = new URL(redirect); } catch { fail(guidance); }
  const loopback = callback.protocol === "http:" && ["127.0.0.1", "localhost"].includes(callback.hostname);
  if ((!loopback && callback.protocol !== "https:") || callback.username || callback.password || callback.hash) fail(guidance);
  verifier = b64url(randomBytes(48));
  link = xAuthorizeUrl({ redirect, state, verifier });
}
const pending = { at: Date.now(), state, redirect, verifier };
writeFileSync(pendingFile, JSON.stringify(pending), { mode: 0o600 });
console.log(`Open this link, sign in with the ${account.name} and press Allow:\n\n${link}\n`);
console.log(`Afterwards, if it does not finish by itself, copy the whole address from the address bar and run:\n  node bin/connect.mjs ${service} "<that address>"\n(the link works for 15 minutes)`);

if (!process.stdin.isTTY) process.exit(0); // an AI agent runs this: it waits for the user and runs step 2

// In a terminal: wait for a local browser callback or for a pasted address.
const local = redirect.match(/^http:\/\/(127\.0\.0\.1|localhost):(\d+)/);
if (local) {
  const callback = new URL(redirect);
  createServer((req, res) => {
    const u = new URL(req.url, callback.origin);
    if (!matchesRedirect(u, callback) || u.searchParams.get("state") !== pending.state ||
        (!u.searchParams.get("code") && !u.searchParams.get("error"))) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Sign-in response received. Go back to the terminal for the result.");
    finish(u.href, pending).catch((e) => fail(e.message));
  }).listen(Number(local[2]), "127.0.0.1").on("error", () => { /* port busy: pasting still works */ });
}
const rl = createInterface({ input: process.stdin });
process.stdout.write("\nOr paste the address here: ");
rl.on("line", (line) => { if (line.trim()) finish(line, pending).catch((e) => fail(e.message)); });
