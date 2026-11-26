// Checks whether installed global skill copies match the repo and (with --online) whether GitHub has updates.
import { existsSync, readdirSync, readFileSync, realpathSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const SKILL_TARGETS = [
  { agent: "Claude Code", rel: ".claude/skills/postweft" },
  { agent: "Antigravity", rel: ".gemini/config/skills/postweft" },
  { agent: "Codex / .agents", rel: ".agents/skills/postweft" },
];

function walkFiles(root, prefix = "") {
  const out = [];
  for (const e of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? join(prefix, e.name) : e.name;
    if (e.isDirectory()) out.push(...walkFiles(root, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

export function findSkillCopies({ repoRoot, homeDir = homedir() } = {}) {
  const src = join(repoRoot, "skill/postweft");
  if (!existsSync(src)) return [];
  const srcReal = realpathSync(src);
  const srcFiles = walkFiles(src);
  const results = [];

  for (const t of SKILL_TARGETS) {
    const target = join(homeDir, t.rel);
    let stat;
    try { stat = lstatSync(target); } catch { continue; }
    if (!existsSync(target)) {
      results.push({ agent: t.agent, path: target, status: "outdated", changed: ["broken link"] });
      continue;
    }
    try {
      if (realpathSync(target) === srcReal) {
        results.push({ agent: t.agent, path: target, status: "ok", linked: true, changed: [] });
        continue;
      }
    } catch { /* fall through to file comparison */ }
    if (!stat.isDirectory() && !stat.isSymbolicLink()) {
      results.push({ agent: t.agent, path: target, status: "outdated", changed: ["not a directory"] });
      continue;
    }
    const changed = [];
    for (const rel of srcFiles) {
      const dstFile = join(target, rel);
      if (!existsSync(dstFile)) { changed.push(rel); continue; }
      if (!readFileSync(join(src, rel)).equals(readFileSync(dstFile))) changed.push(rel);
    }
    results.push({ agent: t.agent, path: target, status: changed.length ? "outdated" : "ok", linked: false, changed });
  }
  return results;
}

export function parseGithubRepo(url) {
  if (!url) return null;
  const m = String(url).trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}

export function isNewerVersion(remoteTag, localVersion) {
  const parse = (v) => {
    const m = String(v || "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? m.slice(1).map(Number) : null;
  };
  const r = parse(remoteTag), l = parse(localVersion);
  if (!r || !l) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] !== l[i]) return r[i] > l[i];
  }
  return false;
}

const defaultGit = (repoRoot, args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();

export async function checkRepoUpdate({
  repoRoot,
  fetchImpl = globalThis.fetch,
  git = defaultGit,
  defaultSlug = "mrtcdmr/postweft",
} = {}) {
  const pkgPath = join(repoRoot, "package.json");
  const localVersion = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")).version || "" : "";
  let slug = defaultSlug, localSha = "", branch = "";
  try {
    const remote = git(repoRoot, ["remote", "get-url", "origin"]);
    slug = parseGithubRepo(remote) || defaultSlug;
    localSha = git(repoRoot, ["rev-parse", "HEAD"]);
    branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch { /* non-git install: release check only */ }

  const headers = { Accept: "application/vnd.github+json", "User-Agent": "postweft-setup-check" };
  const getJson = async (url) => {
    const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10000) });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, body };
  };

  let latestTag = "", releaseUrl = "";
  try {
    const rel = await getJson(`https://api.github.com/repos/${slug}/releases/latest`);
    if (rel.ok && rel.body?.tag_name) {
      latestTag = rel.body.tag_name;
      releaseUrl = rel.body.html_url || "";
    }
  } catch (e) {
    return { status: "error", message: e.message };
  }

  const newerRelease = latestTag && isNewerVersion(latestTag, localVersion);

  if (localSha && (!branch || branch === "main")) {
    try {
      const cmp = await getJson(`https://api.github.com/repos/${slug}/compare/${localSha}...main`);
      if (cmp.ok) {
        const behind = Number(cmp.body?.ahead_by || 0);
        if (behind > 0 || newerRelease) {
          return { status: "update", behind, latestTag: newerRelease ? latestTag : "", releaseUrl, slug };
        }
        return { status: "ok", behind: 0, latestTag, slug };
      }
      if (cmp.status === 404) {
        // Local commit is not on GitHub yet; check whether remote main tip is already in local history.
        const head = await getJson(`https://api.github.com/repos/${slug}/commits/main`);
        if (head.ok && head.body?.sha) {
          let hasRemoteTip = false;
          try { git(repoRoot, ["merge-base", "--is-ancestor", head.body.sha, "HEAD"]); hasRemoteTip = true; } catch { /* behind or diverged */ }
          if (!hasRemoteTip || newerRelease) {
            return { status: "update", behind: null, latestTag: newerRelease ? latestTag : "", releaseUrl, slug };
          }
          return { status: "ok", behind: 0, latestTag, slug };
        }
      }
      if (cmp.status === 403 || cmp.status === 429) {
        if (newerRelease) return { status: "update", behind: null, latestTag, releaseUrl, slug };
        return { status: "error", message: cmp.body?.message || `GitHub API HTTP ${cmp.status}` };
      }
    } catch (e) {
      if (newerRelease) return { status: "update", behind: null, latestTag, releaseUrl, slug };
      return { status: "error", message: e.message };
    }
  }

  if (newerRelease) return { status: "update", behind: null, latestTag, releaseUrl, slug };
  return { status: "ok", behind: 0, latestTag, slug };
}
