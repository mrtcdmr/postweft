import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const home = mkdtempSync(join(tmpdir(), "sa-"));
writeFileSync(join(home, "config.json"), JSON.stringify({ timezone: "Europe/Istanbul" }));
process.env.POSTWEFT_HOME = home;
const { fromLocal, toLocal } = await import("../lib/time.mjs");

test("local time round trip in the configured zone", () => {
  const d = fromLocal("2026-12-01T19:00");
  assert.equal(d.toISOString(), "2026-12-01T16:00:00.000Z");
  assert.deepEqual(toLocal(d), { date: "2026-12-01", time: "19:00", weekday: 2 });
});
