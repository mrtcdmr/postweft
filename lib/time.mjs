// Wall-clock helpers in the configured time zone (no dependencies).
import { TZ } from "./config.mjs";

// "2026-12-01T19:00" in TZ  ->  Date
export function fromLocal(s) {
  const [d, t = "00:00"] = s.split("T");
  const guess = new Date(`${d}T${t.slice(0, 5)}:00Z`);
  // shift by the zone's offset at that moment (twice, to settle around DST changes)
  let ms = guess.getTime();
  for (let i = 0; i < 2; i++) ms = guess.getTime() - offsetMinutes(new Date(ms)) * 60e3;
  return new Date(ms);
}

export function offsetMinutes(date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(date);
  const m = (p.find((x) => x.type === "timeZoneName")?.value || "GMT").match(/([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}

// Date -> { date: "2026-12-01", time: "19:00", weekday: 0-6 (0 = Sunday) } in TZ
export function toLocal(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(date).map((x) => [x.type, x.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday };
}

export const today = () => toLocal(new Date()).date;
export const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
