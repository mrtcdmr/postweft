#!/usr/bin/env node
// Keeps the Threads token alive. Long-lived Threads tokens last 60 days and can be refreshed once they are at least
// 24 hours old; this script asks Threads for a new one and writes it into .env (the value is never printed).
// Run it weekly from cron. If it fails you get a phone notification; then create a new token by hand.
// Instagram: use a Page access token made from a long-lived user token (it does not expire), see the setup guide.
// TikTok: the refresh token lasts a year and is renewed here too (and whenever a video is sent).
// YouTube needs nothing here: its refresh token does not expire while the Google app is "In production".
//   node bin/refresh-tokens.mjs [--status]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { config, env, logger, loadState, statePath } from "../lib/config.mjs";
import { setEnvValue, ENV_FILE } from "../lib/envfile.mjs";
import { notify } from "../lib/notify.mjs";
import { refreshTiktok } from "../lib/tiktok.mjs";

const log = logger("tokens");
const state = loadState("tokens", {});
const daysLeft = (iso) => Math.floor((Date.parse(iso) - Date.now()) / 86400e3);

if (process.argv.includes("--status")) {
  if (state.threads?.expiresAt) console.log(`Threads token: refreshed ${state.threads.refreshedAt.slice(0, 10)}, expires in ${daysLeft(state.threads.expiresAt)} day(s)`);
  else console.log("Threads token: never refreshed by this script (expiry unknown)");
  if (state.tiktok) console.log(`TikTok sign-in: renewed ${state.tiktok.refreshedAt.slice(0, 10)}${state.tiktok.expiresAt ? `, valid for ${daysLeft(state.tiktok.expiresAt)} day(s)` : ""}`);
  process.exit(0);
}

if (config.threads && env.THREADS_TOKEN) {
  try {
    const base = (config.threads.apiBase || "https://graph.threads.net/v1.0").replace(/\/v[\d.]+\/?$/, "");
    const u = new URL(base + "/refresh_access_token");
    u.searchParams.set("grant_type", "th_refresh_token");
    u.searchParams.set("access_token", env.THREADS_TOKEN);
    const j = await (await fetch(u, { signal: AbortSignal.timeout(30000) })).json();
    if (j.error || !j.access_token) throw new Error(j.error?.message || "no token in the answer");
    const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    if (!/^THREADS_TOKEN=/m.test(text)) throw new Error(`THREADS_TOKEN is not in ${ENV_FILE} (set from the environment?), so the new token cannot be saved`);
    setEnvValue("THREADS_TOKEN", j.access_token);
    state.threads = { refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + (j.expires_in || 5184000) * 1000).toISOString() };
    writeFileSync(statePath("tokens"), JSON.stringify(state));
    log("threads token refreshed, expires", state.threads.expiresAt.slice(0, 10));
    console.log(`Threads token refreshed; valid for ${daysLeft(state.threads.expiresAt)} more day(s).`);
  } catch (e) {
    log("ERROR threads refresh", e.message);
    const left = state.threads?.expiresAt ? ` It expires in ${daysLeft(state.threads.expiresAt)} day(s).` : "";
    await notify("Threads token could not be refreshed", `${e.message.slice(0, 300)}.${left}\nCreate a new long-lived token and put it in .env.`, 4, "warning");
    process.exitCode = 1;
  }
} else console.log("No Threads token to refresh.");

if (config.tiktok && env.TIKTOK_REFRESH_TOKEN) {
  try {
    const r = await refreshTiktok();
    state.tiktok = { refreshedAt: new Date().toISOString(), ...(r.refreshExpiresIn ? { expiresAt: new Date(Date.now() + r.refreshExpiresIn * 1000).toISOString() } : {}) };
    writeFileSync(statePath("tokens"), JSON.stringify(state));
    log("tiktok token refreshed");
    console.log("TikTok token refreshed.");
  } catch (e) {
    log("ERROR tiktok refresh", e.message);
    await notify("TikTok sign-in needs renewing", `${e.message.slice(0, 300)}\nRun: node bin/connect.mjs tiktok`, 4, "warning");
    process.exitCode = 1;
  }
}
