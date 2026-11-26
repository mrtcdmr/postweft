// Phone notifications through ntfy (https://ntfy.sh). Install the ntfy app and subscribe to your topic.
// Pick a long random topic name: anyone who knows it can read your notifications.
// CLI: node lib/notify.mjs "Title" "Message"
import { pathToFileURL } from "node:url";
import { config } from "./config.mjs";

// The topic from config.example.json is public: never send to it (anyone could read the messages).
export const EXAMPLE_TOPIC = "pick-a-long-random-name-here";
const clip = (s, n) => { while (Buffer.byteLength(s) > n) s = s.slice(0, -10); return s; };

export async function notify(title, message, priority = 3, tag = "") {
  const topic = config.notify?.ntfyTopic;
  if (!topic || topic === EXAMPLE_TOPIC) return false;
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
  const topic = config.notify?.ntfyTopic;
  if (!topic || topic === EXAMPLE_TOPIC) {
    console.log("not sent: set notify.ntfyTopic in config.json to your own long random name (the example name is public)");
    process.exit(1);
  }
  console.log((await notify(t, m, p || 3, tag)) ? "sent" : "not sent (check notify.ntfyServer and your connection)");
}
