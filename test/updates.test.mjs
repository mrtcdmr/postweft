import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findSkillCopies, parseGithubRepo, isNewerVersion, checkRepoUpdate } from "../lib/updates.mjs";

test("parseGithubRepo and isNewerVersion handle standard formats", () => {
  assert.equal(parseGithubRepo("https://github.com/mrtcdmr/postweft.git"), "mrtcdmr/postweft");
  assert.equal(parseGithubRepo("https://github.com/mrtcdmr/postweft"), "mrtcdmr/postweft");
  assert.equal(parseGithubRepo("git@github.com:mrtcdmr/postweft.git"), "mrtcdmr/postweft");
  assert.equal(parseGithubRepo("https://gitlab.com/foo/bar.git"), null);

  assert.equal(isNewerVersion("v0.2.0", "0.1.0"), true);
  assert.equal(isNewerVersion("0.1.1", "0.1.0"), true);
  assert.equal(isNewerVersion("v1.0.0", "0.9.9"), true);
  assert.equal(isNewerVersion("v0.1.0", "0.1.0"), false);
  assert.equal(isNewerVersion("v0.0.9", "0.1.0"), false);
  assert.equal(isNewerVersion("invalid", "0.1.0"), false);
});

test("findSkillCopies detects matching copies, symlinks, and outdated global copies", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pw-skills-"));
  const repo = join(tmp, "repo");
  const fakeHome = join(tmp, "home");
  mkdirSync(join(repo, "skill/postweft/references"), { recursive: true });
  mkdirSync(fakeHome, { recursive: true });
  writeFileSync(join(repo, "skill/postweft/SKILL.md"), "# PostWeft v2\n");
  writeFileSync(join(repo, "skill/postweft/references/setup.md"), "# Setup v2\n");

  // None installed
  assert.deepEqual(findSkillCopies({ repoRoot: repo, homeDir: fakeHome }), []);

  // Claude Code: up-to-date copy
  mkdirSync(join(fakeHome, ".claude/skills"), { recursive: true });
  cpSync(join(repo, "skill/postweft"), join(fakeHome, ".claude/skills/postweft"), { recursive: true });

  // Antigravity: outdated copy (SKILL.md differs, references/setup.md missing)
  mkdirSync(join(fakeHome, ".gemini/config/skills/postweft"), { recursive: true });
  writeFileSync(join(fakeHome, ".gemini/config/skills/postweft/SKILL.md"), "# PostWeft v1\n");

  // Codex / .agents: symlinked directly to repo
  mkdirSync(join(fakeHome, ".agents/skills"), { recursive: true });
  symlinkSync(join(repo, "skill/postweft"), join(fakeHome, ".agents/skills/postweft"));

  const found = findSkillCopies({ repoRoot: repo, homeDir: fakeHome });
  assert.equal(found.length, 3);
  assert.deepEqual(found[0], { agent: "Claude Code", path: join(fakeHome, ".claude/skills/postweft"), status: "ok", linked: false, changed: [] });
  assert.equal(found[1].agent, "Antigravity");
  assert.equal(found[1].status, "outdated");
  assert.deepEqual(found[1].changed, ["SKILL.md", "references/setup.md"]);
  assert.deepEqual(found[2], { agent: "Codex / .agents", path: join(fakeHome, ".agents/skills/postweft"), status: "ok", linked: true, changed: [] });
});

test("checkRepoUpdate reports releases, commits ahead, unpushed local commits, and errors cleanly", async () => {
  const repo = mkdtempSync(join(tmpdir(), "pw-upd-"));
  writeFileSync(join(repo, "package.json"), JSON.stringify({ version: "0.1.0" }));

  const fakeGit = (overrides = {}) => (_root, args) => {
    const key = args.join(" ");
    if (key in overrides) {
      if (overrides[key] instanceof Error) throw overrides[key];
      return overrides[key];
    }
    if (key === "remote get-url origin") return "https://github.com/mrtcdmr/postweft.git";
    if (key === "rev-parse HEAD") return "aaa111";
    if (key === "rev-parse --abbrev-ref HEAD") return "main";
    throw new Error("unexpected git: " + key);
  };
  const jsonRes = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

  // 1. Up to date (same release, 0 commits ahead)
  const rOk = await checkRepoUpdate({
    repoRoot: repo,
    git: fakeGit(),
    fetchImpl: async (url) => url.includes("/releases/latest")
      ? jsonRes(200, { tag_name: "v0.1.0" })
      : jsonRes(200, { status: "identical", ahead_by: 0 }),
  });
  assert.equal(rOk.status, "ok");

  // 2. Behind main by 2 commits + new release v0.2.0
  const rBehind = await checkRepoUpdate({
    repoRoot: repo,
    git: fakeGit(),
    fetchImpl: async (url) => url.includes("/releases/latest")
      ? jsonRes(200, { tag_name: "v0.2.0", html_url: "https://github.com/mrtcdmr/postweft/releases/tag/v0.2.0" })
      : jsonRes(200, { status: "ahead", ahead_by: 2 }),
  });
  assert.equal(rBehind.status, "update");
  assert.equal(rBehind.behind, 2);
  assert.equal(rBehind.latestTag, "v0.2.0");

  // 3. Unpushed local commit (compare 404), remote tip IS ancestor -> ok
  const rLocalAhead = await checkRepoUpdate({
    repoRoot: repo,
    git: fakeGit({ "merge-base --is-ancestor bbb222 HEAD": "" }),
    fetchImpl: async (url) => {
      if (url.includes("/releases/latest")) return jsonRes(200, { tag_name: "v0.1.0" });
      if (url.includes("/compare/")) return jsonRes(404, { message: "Not Found" });
      return jsonRes(200, { sha: "bbb222" });
    },
  });
  assert.equal(rLocalAhead.status, "ok");

  // 4. Unpushed local commit (compare 404), remote tip is NOT ancestor -> update
  const rDiverged = await checkRepoUpdate({
    repoRoot: repo,
    git: fakeGit({ "merge-base --is-ancestor ccc333 HEAD": new Error("not ancestor") }),
    fetchImpl: async (url) => {
      if (url.includes("/releases/latest")) return jsonRes(200, { tag_name: "v0.1.0" });
      if (url.includes("/compare/")) return jsonRes(404, { message: "Not Found" });
      return jsonRes(200, { sha: "ccc333" });
    },
  });
  assert.equal(rDiverged.status, "update");

  // 5. Network failure -> error status (never throws)
  const rErr = await checkRepoUpdate({
    repoRoot: repo,
    git: fakeGit(),
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.equal(rErr.status, "error");
  assert.match(rErr.message, /offline/);
});

test("setup-check.mjs warns when an installed global skill copy is behind the repo", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pw-sc-skill-"));
  const dataHome = join(tmp, "data");
  const fakeUserHome = join(tmp, "userhome");
  mkdirSync(dataHome, { recursive: true });
  mkdirSync(join(fakeUserHome, ".gemini/config/skills/postweft"), { recursive: true });
  writeFileSync(join(fakeUserHome, ".gemini/config/skills/postweft/SKILL.md"), "# Old copy\n");
  writeFileSync(join(dataHome, "brand.md"), "# Acme\nHandmade ceramics.\n");
  writeFileSync(join(dataHome, "config.json"), JSON.stringify({
    timezone: "UTC",
    brand: { name: "Acme", language: "English", factsFile: "brand.md", allowedLinks: ["acme.test"] },
    voice: { provider: "none" },
  }));

  const res = spawnSync("node", ["bin/setup-check.mjs"], {
    env: { ...process.env, HOME: fakeUserHome, POSTWEFT_HOME: dataHome },
    encoding: "utf8",
  });
  assert.match(res.stdout, /update\s+installed skill \(Antigravity\)/);
  assert.match(res.stdout, /is behind repo skill\/postweft/);
  assert.match(res.stdout, /1 update notice above/);
  if (spawnSync(process.env.FFMPEG || "ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) {
    assert.equal(res.status, 0);
  }
});
