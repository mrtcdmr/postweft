// Asks Claude Code (headless, all tools disabled) for a JSON answer.
// Incoming comments and messages are passed as data inside the prompt; the model has no tools, so it cannot act on them.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { config, HOME, STATE } from "./config.mjs";

const NO_TOOLS = ["Bash", "Write", "Edit", "Read", "WebFetch", "WebSearch", "Glob", "Grep", "NotebookEdit", "Task"];

export function brandFacts() {
  const f = config.brand?.factsFile || "brand.md";
  const p = isAbsolute(f) ? f : join(HOME, f);
  if (!existsSync(p)) throw new Error(`brand facts file missing: ${p} (copy prompts/brand.example.md)`);
  return readFileSync(p, "utf8");
}

export function askJson(prompt) {
  const out = execFileSync(config.claude?.bin || "claude", ["-p", prompt, "--output-format", "text", "--disallowedTools", ...NO_TOOLS], {
    cwd: STATE, encoding: "utf8", timeout: 300000, maxBuffer: 4e6,
  });
  const a = out.indexOf("["), b = out.lastIndexOf("]");
  if (a < 0 || b < a) throw new Error("no JSON array in the answer");
  return JSON.parse(out.slice(a, b + 1));
}
