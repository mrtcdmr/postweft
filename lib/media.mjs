// Instagram and Threads fetch media from a public URL, so local files must be put somewhere reachable first.
// config.media.mode:
//   "dir"     copy the file into media.dir, which your web server publishes at media.publicBaseUrl
//   "command" run media.uploadCommand; it gets {file} and {name}, must print the public URL on stdout
//             (example: "aws s3 cp {file} s3://my-bucket/{name} >/dev/null && echo https://my-bucket.s3.amazonaws.com/{name}")
// media.cleanupCommand (optional, {name}) removes the file after publishing.
import { copyFileSync, rmSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { config } from "./config.mjs";

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function publicUrl(file) {
  if (/^https?:\/\//.test(file)) return { url: file, name: null };
  const m = config.media || {};
  const name = `sa-${Date.now()}-${randomBytes(6).toString("hex")}${extname(file)}`;
  if (m.mode === "dir") {
    mkdirSync(m.dir, { recursive: true });
    copyFileSync(file, join(m.dir, name));
    return { url: `${m.publicBaseUrl.replace(/\/$/, "")}/${name}`, name };
  }
  if (m.mode === "command") {
    const url = execSync(m.uploadCommand.replaceAll("{file}", quote(file)).replaceAll("{name}", quote(name)), { encoding: "utf8" }).trim().split("\n").pop();
    if (!/^https?:\/\//.test(url)) throw new Error("uploadCommand did not print a URL");
    return { url, name };
  }
  throw new Error('config.media.mode must be "dir" or "command"');
}

export function cleanup(name) {
  if (!name) return;
  const m = config.media || {};
  try {
    if (m.mode === "dir") rmSync(join(m.dir, name), { force: true });
    else if (m.cleanupCommand) execSync(m.cleanupCommand.replaceAll("{name}", quote(name)));
  } catch { /* leftovers are harmless */ }
}
