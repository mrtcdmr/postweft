#!/usr/bin/env node
// Daily summary to your phone: what was published in the last 24 hours, what is coming in the next 24, what failed.
//   node bin/summary.mjs [--print]
import { readQueue } from "../lib/queue.mjs";
import { fromLocal } from "../lib/time.mjs";
import { notify } from "../lib/notify.mjs";

const now = Date.now(), day = 86400e3, q = readQueue();
const t = (x) => fromLocal(x.at).getTime();
const line = (x) => `${x.at.slice(5).replace("T", " ")} ${x.platform} ${x.kind}${x.link ? " " + x.link : ""}`;
const done = q.filter((x) => x.status === "published" && t(x) > now - day);
const next = q.filter((x) => ["pending", "prepared"].includes(x.status || "pending") && t(x) >= now && t(x) < now + day);
const bad = q.filter((x) => ["failed", "missed"].includes(x.status) && t(x) > now - day);
const left = q.filter((x) => ["pending", "prepared"].includes(x.status || "pending") && t(x) >= now).length;
const msg = [
  `Published (24h): ${done.length}`, ...done.map(line), "",
  `Next 24h: ${next.length}`, ...next.map(line), "",
  ...(bad.length ? [`Problems: ${bad.length}`, ...bad.map((x) => `${line(x)} (${x.status}${x.error ? ": " + x.error.slice(0, 80) : ""})`), ""] : []),
  `Still queued: ${left}`,
].join("\n");
if (process.argv.includes("--print")) console.log(msg);
else console.log((await notify("Daily social summary", msg, 2)) ? "sent" : msg);
