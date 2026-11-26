// The "brain" behind automatic replies. Pick one in config.json -> "ai": { "provider": ..., "model": ... }
//   "claude"  Claude Code CLI, headless, every tool disabled            (default; needs `claude` logged in)
//   "codex"   OpenAI Codex CLI, `codex exec` in a read-only sandbox in an empty folder (needs `codex` logged in)
//   "gemini"  Gemini API directly (GEMINI_API_KEY in .env; model default "gemini-flash-latest")
//   "command" any command that reads the prompt on stdin and prints the answer (ai.command, e.g. a local model)
// Incoming comments and messages are passed only as data inside the prompt. The answer must contain a JSON array.
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { config, env, HOME, STATE } from "./config.mjs";

const AI = config.ai || { provider: "claude" };
const NO_TOOLS = ["Bash", "Write", "Edit", "Read", "WebFetch", "WebSearch", "Glob", "Grep", "NotebookEdit", "Task"];
const RUN = { encoding: "utf8", timeout: 300000, maxBuffer: 4e6 };

export function brandFacts() {
  const f = config.brand?.factsFile || "brand.md";
  const p = isAbsolute(f) ? f : join(HOME, f);
  if (!existsSync(p)) throw new Error(`brand facts file missing: ${p} (copy prompts/brand.example.md)`);
  return readFileSync(p, "utf8");
}

function claude(prompt) {
  const args = ["-p", prompt, "--output-format", "text", "--disallowedTools", ...NO_TOOLS];
  if (AI.model) args.push("--model", AI.model);
  return execFileSync(AI.bin || "claude", args, { ...RUN, cwd: STATE });
}

function codex(prompt) {
  // Empty working folder + read-only sandbox: there is nothing to read and nothing it may change.
  const dir = mkdtempSync(join(tmpdir(), "sa-codex-")), out = join(dir, "answer.txt");
  try {
    const args = ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message", out];
    if (AI.model) args.push("--model", AI.model);
    execFileSync(AI.bin || "codex", [...args, "-"], { ...RUN, cwd: dir, input: prompt, stdio: ["pipe", "ignore", "pipe"] });
    return readFileSync(out, "utf8");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function gemini(prompt) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing in .env");
  const model = AI.model || "gemini-flash-latest";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }),
    signal: AbortSignal.timeout(180000),
  });
  const j = await r.json();
  if (j.error) throw new Error("Gemini: " + j.error.message);
  return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
}

function command(prompt) {
  if (!AI.command) throw new Error('ai.command is empty (provider "command")');
  return execSync(AI.command, { ...RUN, cwd: STATE, input: prompt });
}

export async function askJson(prompt) {
  const p = AI.provider || "claude";
  const run = { claude, codex, gemini, command }[p];
  if (!run) throw new Error(`unknown ai.provider "${p}" (claude | codex | gemini | command)`);
  const out = await run(prompt);
  const a = out.indexOf("["), b = out.lastIndexOf("]");
  if (a < 0 || b < a) throw new Error("no JSON array in the answer");
  return JSON.parse(out.slice(a, b + 1));
}
