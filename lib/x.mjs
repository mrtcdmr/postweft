// X API v2 OAuth 2.0 with PKCE. The refresh token is saved locally and rotated when X returns a replacement.
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { env, statePath } from "./config.mjs";
import { ENV_FILE, setEnvValue } from "./envfile.mjs";

export const X_API = "https://api.x.com/2";
const X_SCOPES = "tweet.read tweet.write users.read offline.access";
let cached;
let refresh;

export function xAuthorizeUrl({ redirect, state, verifier }) {
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: env.X_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: X_SCOPES, state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  });
  return url.href;
}

export async function xToken(params) {
  const clientId = env.X_CLIENT_ID;
  if (!clientId) throw new Error("X: X_CLIENT_ID missing in .env");

  const headers = { "content-type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams(params);
  if (env.X_CLIENT_SECRET) {
    headers.authorization = "Basic " + Buffer.from(`${clientId}:${env.X_CLIENT_SECRET}`).toString("base64");
  } else {
    body.set("client_id", clientId);
  }

  const r = await fetch(X_API + "/oauth2/token", {
    method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(30000),
  });
  const grant = await r.json().catch(() => null);
  if (!r.ok || !grant?.access_token) {
    // Avoid logging the token endpoint's response body, which can include credential material.
    const hint = grant?.error === "invalid_grant" ? " Run: node bin/connect.mjs x" : "";
    throw new Error(`X sign-in failed (HTTP ${r.status}).${hint}`);
  }
  return grant;
}

function latestRefreshToken() {
  // Another CLI process may have rotated the token after this process loaded its config.
  try {
    return /^X_REFRESH_TOKEN=([^\r\n]*)/m.exec(readFileSync(ENV_FILE, "utf8"))?.[1].trim() || env.X_REFRESH_TOKEN;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    return env.X_REFRESH_TOKEN;
  }
}

async function refreshAccess() {
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    const current = latestRefreshToken();
    if (!current) throw new Error("X: no refresh token in .env (run: node bin/connect.mjs x)");

    // Lock the current refresh token across processes. Reconnecting issues a different token, so
    // an interrupted process cannot leave a lock that blocks a fresh X sign-in.
    const lockFile = statePath("x-refresh-" + createHash("sha256").update(current).digest("hex"));
    let lock;
    try {
      lock = openSync(lockFile, "wx", 0o600);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      await delay(150);
      continue;
    }
    try {
      if (latestRefreshToken() !== current) continue;
      const grant = await xToken({ grant_type: "refresh_token", refresh_token: current });
      if (latestRefreshToken() !== current) continue;
      if (grant.refresh_token && grant.refresh_token !== current) setEnvValue("X_REFRESH_TOKEN", grant.refresh_token);
      cached = { token: grant.access_token, until: Date.now() + (grant.expires_in || 7200) * 1000 };
      return cached.token;
    } finally {
      closeSync(lock);
      unlinkSync(lockFile);
    }
  }
  throw new Error("X token refresh is busy. Try again, or run: node bin/connect.mjs x");
}

export async function xAccessToken() {
  if (cached && cached.until > Date.now() + 60e3) return cached.token;
  // Keep simultaneous callers in this process from spending the same rotating refresh token twice.
  refresh ??= refreshAccess().finally(() => { refresh = undefined; });
  return refresh;
}
