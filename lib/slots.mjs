// Picks the next free "best time" slot for a platform from slots.json.
// slots.json example: config/slots.example.json. Days use 0 = Sunday ... 6 = Saturday.
//   { "blackout": ["01:00", "06:00"],
//     "instagram": { "reel": { "days": { "1": [["19:00","20:00"]], ... }, "minGapMinutes": 90, "maxPerDay": 2 } },
//     "threads":   { "days": {...}, "minGapMinutes": 60, "maxPerDay": 4 } }
import { slots } from "./config.mjs";
import { readQueue } from "./queue.mjs";
import { fromLocal, toLocal, minutes, hhmm } from "./time.mjs";

export function rule(platform, kind) {
  const p = slots[platform];
  if (!p) return null;
  return p[kind] || (p.days ? p : null);
}

// Returns "YYYY-MM-DDTHH:MM" (local time) or null if nothing fits in the next `days` days.
export function nextSlot(platform, kind, { after = new Date(), days = 14, step = 15 } = {}) {
  const r = rule(platform, kind);
  if (!r) return null;
  const taken = readQueue()
    .filter((q) => q.platform === platform && q.status !== "failed" && q.status !== "missed")
    .map((q) => fromLocal(q.at).getTime());
  const [bo1, bo2] = (slots.blackout || []).map(minutes);
  for (let d = 0; d < days; d++) {
    const day = toLocal(new Date(after.getTime() + d * 86400e3));
    const windows = r.days?.[String(day.weekday)] || [];
    const sameDay = taken.filter((t) => toLocal(new Date(t)).date === day.date);
    if (sameDay.length >= (r.maxPerDay ?? 2)) continue;
    for (const [a, b] of windows) {
      for (let m = minutes(a); m < minutes(b); m += step) {
        if (bo1 != null && m >= bo1 && m < bo2) continue;
        const at = `${day.date}T${hhmm(m)}`, t = fromLocal(at).getTime();
        if (t < after.getTime()) continue;
        if (taken.some((x) => Math.abs(x - t) < (r.minGapMinutes ?? 60) * 60e3)) continue;
        return at;
      }
    }
  }
  return null;
}
