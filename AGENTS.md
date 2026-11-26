# Instructions for AI coding agents

This file is read by Codex, Antigravity, Cursor and other agents that follow the AGENTS.md convention.
Claude Code reads `CLAUDE.md` and Gemini-based tools read `GEMINI.md`; both point to the same guide, so every
agent works the same way.

**Before any social media task** (planning, captions, videos, scheduling, replies), read these two files and follow
them exactly:

1. `skill/postweft/SKILL.md` - the workflow and the hard rules (nothing is published without the user's yes,
   brand facts only, never print secrets, official APIs only, keep `HANDOFF.md` up to date)
2. `skill/postweft/references/platform-rules.md` - limits for each platform

## Working on the code itself

- Node.js 20+, ES modules, no build step. Run `npm run check` after every change (syntax + tests).
- Keep it brand-neutral: no real brand names, account ids, tokens or personal data in the repo.
- Official platform APIs only (Instagram Graph API, Threads API, YouTube Data API, TikTok Content Posting API, X API v2).
  Do not add browser automation, scraping, unofficial social platform APIs, or commenting on other people's posts.
- Video templates: every frame must be a pure function of time (`window.render(t)`), with no emoji (use SVG).
