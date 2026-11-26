// Writes one value into the .env file of the data directory (for tokens the services renew themselves).
// The value is never printed. The file keeps mode 600.
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { HOME, env } from "./config.mjs";

export const ENV_FILE = join(HOME, ".env");

export function setEnvValue(key, value) {
  if (!/^[A-Z0-9_]+$/.test(key)) throw new Error("bad key " + key);
  if (/[\r\n]/.test(value)) throw new Error("value contains a line break");
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, () => `${key}=${value}`) : text.replace(/\n?$/, "\n") + `${key}=${value}\n`;
  writeFileSync(ENV_FILE, text, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
  env[key] = value;
}
