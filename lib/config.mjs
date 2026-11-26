// Loads settings from the data directory (default ~/.config/postweft, override with POSTWEFT_HOME).
//   config.json  settings (copy config/config.example.json)
//   .env         secrets: INSTAGRAM_TOKEN, THREADS_TOKEN (never commit this file)
//   slots.json   best posting windows per platform (copy config/slots.example.json)
//   queue/       one JSON file per scheduled post
//   state/       what has been seen/answered
//   logs/        plain text logs
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { HOME } from "./data-home.mjs";

export { HOME };
export const QUEUE = join(HOME, "queue");
export const STATE = join(HOME, "state");
export const LOGS = join(HOME, "logs");
for (const d of [HOME, QUEUE, STATE, LOGS]) mkdirSync(d, { recursive: true });

const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback);

export const config = readJson(join(HOME, "config.json"), null);
if (!config) {
  console.error(`No config found. Copy config/config.example.json to ${join(HOME, "config.json")} and edit it.`);
  process.exit(1);
}
export const slots = readJson(join(HOME, "slots.json"), {});

function readEnv(f) {
  if (!existsSync(f)) return {};
  return Object.fromEntries(
    readFileSync(f, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}
export const env = { ...readEnv(join(HOME, ".env")), ...process.env };

export const TZ = config.timezone || "UTC";

export function logger(name) {
  const f = join(LOGS, name + ".log");
  return (...a) => {
    const line = [new Date().toISOString(), ...a].join(" ");
    appendFileSync(f, line + "\n");
    // In a terminal every line is shown; otherwise (an AI agent or cron runs it) errors still go to stderr,
    // so a problem such as a missing token is never hidden in the log file only.
    if (process.stdout.isTTY) console.log(line);
    else if (/^(ERROR|MISSED)/.test(String(a[0]))) console.error(line);
  };
}

export const statePath = (name) => join(STATE, name + ".json");
export const loadState = (name, fallback = {}) => readJson(statePath(name), fallback);
