# social-autopilot

[Türkçe](README.tr.md)

Run a small brand's Instagram and Threads with an AI coding agent as your social media assistant:
**Claude Code, OpenAI Codex or Google Antigravity / Gemini CLI**, or switch between them. Free and open source (MIT).

- **Video from HTML.** Vertical 1080x1920 videos from simple HTML templates, rendered frame by frame. Built-in
  license-free music generator, voice-over from ElevenLabs, OpenAI, Gemini or a local TTS,
  and word-by-word captions.
- **Posting queue with best times.** Each post is a small JSON file. It goes into the next free slot from your own
  "best times" table and is published on time by cron.
- **Replies with judgment.** An AI of your choice (Claude, Codex, Gemini or any command) answers comments on your
  own posts and Instagram DMs. Complaints, offers and
  anything unclear are sent to your phone instead.
- **One guide for every agent.** `AGENTS.md` (Codex, Antigravity, Cursor...), `CLAUDE.md` and `GEMINI.md` all load the
  same workflow: plan, write, render, show you, and publish only after you say yes. A shared `HANDOFF.md` lets you
  switch agents mid-week (for example when one runs out of quota) without losing track.

Everything uses the **official** Instagram Graph API and Threads API. There is no browser automation, no scraping, no
auto-following and no commenting on strangers' posts. Those get accounts banned, and they are spam.

> Status: early. The code was extracted from a setup that runs a real brand's accounts daily, then rewritten to be
> brand-neutral. Read what a script does before you put it in cron, and start with the `--dry` modes.

## How it fits together

```
you ── talk to ──> Claude Code / Codex / Antigravity (AGENTS.md, CLAUDE.md, GEMINI.md)
                      │ writes captions, edits templates, renders videos, asks before queueing
                      v
video/build.sh ──> work/my-video.mp4 ──> bin/queue-add.mjs ──> ~/.config/social-autopilot/queue/*.json
                                                                     │  cron, every 5 min
                                                                     v
                                                    bin/publish-queue.mjs ──> Instagram / Threads API

cron ──> bin/reply-comments.mjs, bin/reply-dms.mjs ──> AI (claude | codex | gemini | command) ──> reply via API, or ntfy
cron ──> bin/summary.mjs ──> daily summary to your phone
```

## Requirements

- Linux or macOS with Node.js 20+ and ffmpeg
- At least one AI: [Claude Code](https://claude.com/claude-code), [Codex CLI](https://github.com/openai/codex), or a
  Gemini API key (works well alongside Antigravity, which has no headless mode for cron jobs)
- Instagram professional (business or creator) account, Threads account, and a Meta developer app with the
  permissions listed in `config/env.example`
- A place to host files at a public URL for a few minutes while Meta downloads them: a folder your web server
  publishes, or any bucket you can upload to from the command line (`media` in config)
- Optional: Python 3 + `pip install faster-whisper` for captions; [ntfy](https://ntfy.sh) app for phone notifications

## Setup

```bash
git clone https://github.com/mrtcdmr/social-autopilot.git
cd social-autopilot
npm install
npx playwright install chromium

mkdir -p ~/.config/social-autopilot
cp config/config.example.json ~/.config/social-autopilot/config.json
cp config/slots.example.json  ~/.config/social-autopilot/slots.json
cp config/env.example         ~/.config/social-autopilot/.env && chmod 600 ~/.config/social-autopilot/.env
cp prompts/brand.example.md   ~/.config/social-autopilot/brand.md
```

1. **config.json**: time zone, brand language, your Instagram user id, media hosting, ntfy topic, and `ai.provider`
   for the reply bots: `claude` (default), `codex`, `gemini` (needs `GEMINI_API_KEY`) or `command` (any program that
   reads the prompt on stdin and prints the answer, for example a local model).
2. **.env**: your long-lived tokens. Edit the file yourself. Never paste tokens into a chat.
3. **brand.md**: the facts the reply bot may use. Anything missing is sent to you instead of guessed.
4. **slots.json**: when to post. The example times are placeholders. Use your own account insights.
5. **Your agent**: open the repo folder in Claude Code, Codex or Antigravity; it picks up `CLAUDE.md`, `AGENTS.md`
   or `GEMINI.md` by itself. For Claude Code you can also install the skill globally:
   `mkdir -p ~/.claude/skills && cp -r skill/social-autopilot ~/.claude/skills/`. Then ask things like
   *"plan next week"*, *"make a reel about our new blend"*, *"what's scheduled tomorrow?"*.
6. **Cron**: see `examples/crontab.txt`.

## Try it without any account

```bash
cp -r video/templates/starter work/demo
bash video/build.sh work/demo          # -> work/demo.mp4 and work/demo.jpg (music only, ~1 minute)
node video/capture.mjs work/demo stills 0.5 4 11   # quick preview frames in work/demo/stills/
```

## Voice-over

Set `voice` in `config.json` once and every video gets a voice-over from its `LINES` texts:

| provider | settings | key in `.env` |
|---|---|---|
| `elevenlabs` | `voiceId` (from your ElevenLabs voice library), `model`, `language`, `speed`, `stability` | `ELEVENLABS_API_KEY` |
| `openai` | `voice` (e.g. `alloy`), `model`, `instructions` (tone, e.g. "warm and upbeat"), `speed` | `OPENAI_API_KEY` |
| `gemini` | `voice` (e.g. `Kore`), `model`, `instructions` | `GEMINI_API_KEY` |
| `command` | `command`: any local TTS that reads text on stdin and writes `{out}` (e.g. Piper) | none |
| `none` | no generated voice (default) | none |

A single video can use different settings with `export const VOICE = { ... }` in its `timeline.mjs` (another voice,
another speed). Lines are only generated again when their text or the settings change, and recordings you put in
`voice/<i>.wav` yourself are never overwritten. If a line is longer than its slot (`until - at`), the build tells
you so you can shorten the text or raise `speed`. Try it alone first: `node video/voice.mjs work/demo`.

## Commands

| Command | What it does |
|---|---|
| `bash video/build.sh <dir>` | music + voice-over + captions + frames + mix -> `<dir>.mp4` and cover `<dir>.jpg` |
| `node video/voice.mjs <dir> [--force]` | generate the voice-over only, to listen first |
| `node video/capture.mjs <dir> stills 1 2.5` | preview frames only |
| `node bin/queue-add.mjs --platform instagram --video x.mp4 --caption-file x.txt [--at 2026-12-01T19:00] [--dry]` | add a post (next best slot if no `--at`) |
| `node bin/publish-queue.mjs` | publish what is due (cron, every 5 min) |
| `node bin/reply-comments.mjs [--dry]` | answer comments on your own recent posts |
| `node bin/reply-dms.mjs [--dry]` | answer Instagram DMs (needs messaging permission) |
| `node bin/summary.mjs [--print]` | last/next 24 hours to your phone |
| `npm run check` | syntax check + tests |

## Making your own templates

A template is a folder with `video.html` and `timeline.mjs`. The page defines `window.render(t)`, which draws the
frame at second `t` and must depend only on `t`. It also defines `window.ready`, a promise that resolves when images and
fonts are loaded. `timeline.mjs` exports `DURATION`, `POSTER` (cover time), `LINES` (voice-over) and, optionally,
effect times (`POPS`, `CUTS`, `STAMPS`, `BELLS`, `SUCCESS`, `TYPES`, `RISES`) that the music generator turns into
sounds in the same key. Shared helpers live in `video/lib/`. Don't use emoji in templates, use SVG.

## Safety notes

- The reply bots see comments and messages only as data, with every tool disabled, and every reply passes a filter
  (length, no foreign links, no @ or #) before it is sent. Daily limits are in `config.json`.
- The first real run of each reply script only marks existing comments and messages as seen, so the bot never answers
  your history.
- E-mail addresses and phone numbers are masked before text goes to the model.
- Read Meta's [Platform Terms](https://developers.facebook.com/terms/) and automation rules. You are responsible for
  what your account posts.

## License

MIT. Contributions welcome. Keep it brand-neutral and on official APIs.
