// Caption helpers and platform text rules.

// Instagram and TikTok accept at most 5 hashtags per post; extra ones are dropped (first ones are kept).
export function limitHashtags(text, max = 5) {
  let n = 0;
  return text
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m) => (++n <= max ? m : ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Threads turns the first hashtag into the post's topic, which often looks wrong.
// Hashtags are removed and the topic is sent separately (config.threads.topicTag).
export function threadsText(text) {
  return text
    .split("\n").filter((l) => !/^\s*(#\S+\s*)+$/.test(l)).join("\n")
    .replace(/(^|[ \t])#[\p{L}\p{N}_]+/gu, "$1")
    .replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Hide e-mail addresses and phone numbers before text is sent to an AI model.
export const mask = (s) =>
  String(s || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "<phone>");

// A reply written by the model is only sent if it passes these checks.
// allowed: domains that may appear in a reply (e.g. ["example.com"]).
export function safeReply(text, { min = 2, max = 400, allowed = [] } = {}) {
  const t = String(text || "").trim();
  if (t.length < min || t.length > max) return false;
  if (/@\w|#\w/.test(t)) return false;
  let rest = t;
  for (const d of allowed) rest = rest.replace(new RegExp(d.replace(/[.]/g, "\\."), "gi"), "");
  return !/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|co|me|tv|ly|gg|xyz)\b/i.test(rest);
}
