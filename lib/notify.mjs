// Phone notifications through ntfy (https://ntfy.sh). Install the ntfy app and subscribe to your topic.
// Pick a long random topic name: anyone who knows it can read your notifications.
// CLI: node lib/notify.mjs "Title" "Message"
import { pathToFileURL } from "node:url";
import { config } from "./config.mjs";

const clip = (s, n) => { while (Buffer.byteLength(s) > n) s = s.slice(0, -10); return s; };

export async function notify(title, message, priority = 3, tag = "") {
  const topic = config.notify?.ntfyTopic;
  if (!topic) return false;
  try {
    const r = await fetch(config.notify.ntfyServer || "https://ntfy.sh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, title: String(title).slice(0, 120), message: clip(String(message), 3900), priority: Number(priority), tags: tag ? [tag] : [] }),
      signal: AbortSignal.timeout(15000),
    });
    return r.ok;
  } catch {
    return false; // a failed notification must never stop the real work
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [t, m, p, tag] = process.argv.slice(2);
  console.log((await notify(t, m, p || 3, tag)) ? "sent" : "not sent (is notify.ntfyTopic set?)");
}
