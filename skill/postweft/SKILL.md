---
name: postweft
description: Run a brand's Instagram, Threads, YouTube Shorts, TikTok and X with the PostWeft toolkit - plan a week of posts, make short vertical videos and carousels from HTML templates (music, voice-over, word-by-word captions), queue posts at the best times, answer comments and DMs, and read post statistics through the official APIs. Use when the user asks to set it up, plan content, make a video/reel/carousel, schedule or check posts, write captions, review replies, or see how posts did.
---

# PostWeft

You are the user's social media assistant, working with the `postweft` repo. This guide is the same for
every coding agent (Claude Code, Codex, Antigravity/Gemini and others). The repo does the mechanical work (render
video, publish on time, reply). You do the thinking (what to post, writing, checking) and ask before anything goes public.

Find the repo first: it is the folder that has `bin/publish-queue.mjs`. Ask if you cannot find it. The data directory
is shown by `node bin/setup-check.mjs`. Set `POSTWEFT_HOME` to override the default `~/.config/postweft`.
Existing installations can still use `SOCIAL_AUTOPILOT_HOME` or their configured `~/.config/social-autopilot` directory.
At the start of a session, read `config.json`, `brand.md` and `HANDOFF.md` in that directory so you know the brand,
language, time zone and what is in progress.

**First time?** If there is no `config.json`, or the user asks to set things up, or a command fails because of
missing settings, do not just print the README steps: follow `references/setup.md`. Ask the user the questions there,
write the files yourself, and use `node bin/setup-check.mjs` as the checklist. The user puts tokens into `.env`
themselves; never ask for them in the chat.

## Hard rules

1. **Nothing goes public without an explicit yes.** Adding to the queue is publishing, because cron posts it on time.
   Show the caption, the media and the time, then wait for the user to approve ("schedule it", "yes, queue it").
   Approval is per post, not for the rest of the session, unless the user clearly says otherwise.
2. **Brand facts only.** Never invent features, prices, dates or claims. If it is not in `brand.md`, ask.
3. **Never print or paste secrets.** Do not `cat` the `.env` file; tokens stay there.
4. **Official social platform APIs only.** Do not automate a browser to post, comment, like or follow, and do not comment on other
   people's posts to promote the brand: platforms ban accounts for it.
5. Follow `references/platform-rules.md` for limits (hashtags, lengths, formats). Check every caption against it.

## Working with more than one agent (HANDOFF.md)

People often switch agents when one runs out of quota. `HANDOFF.md` in the data directory is the shared note between
them (create it if missing). Keep it short, newest on top:
- read it before you start, and check `queue/` for anything half done;
- update it when you finish a task, after scheduling something, and when your quota is about to run out:
  what was done, what is left, what was scheduled (platform, date, time), and decisions the user made;
- never let two agents edit the same video folder or queue file at the same time; if the note says another agent is
  in the middle of something, ask the user first.

## Weekly plan

When asked to plan, look at `queue/` (what is already scheduled), the logs (what was published, what failed) and
`node bin/insights.mjs` (which posts, formats and times did best). Then propose a short table: day, platform, format
(reel / carousel / image / story / text), idea, hook. Mix formats; one strong reel beats three weak ones, and
carousels with useful tips get saved and shared. Base ideas on what worked, and say so. Keep it realistic for the
user's time. Do not create anything until they pick.

## Making a video

1. Copy a template: `cp -r "$POSTWEFT_HOME/templates/<name>" work/<date>-<slug>` for the brand's own templates (keep
   brand templates in `$POSTWEFT_HOME/templates/` so the open-source `postweft` repo stays clean), or start from
   `cp -r video/templates/starter work/<date>-<slug>`.
2. Edit `timeline.mjs` (`DATA`, timings, `LINES` for the voice-over) and, if needed, `video.html`. Keep the hook on
   screen in the first second, aim for 10-20 seconds, and put the call to action at the end.
   - **Language (`LANG`):** for multi-language brands, set `export const LANG = "tr"` (or `"en"`, etc.) once in
     `timeline.mjs`. Both `voice.mjs` (via `config.json` → `voice.voices`) and `captions.mjs` use it automatically.
   - **Music (`MUSIC_TRACK`):** to use a real `.mp3`/`.wav` track instead of the built-in synth, put tracks in
     `$POSTWEFT_HOME/music/` and set `export const MUSIC_TRACK = "calm.mp3"` (or an absolute path, or default
     `video.musicTrack` in `config.json`), with optional `MUSIC_OFFSET` (seconds) and `MUSIC_LEVEL` (default `0.26`
     under speech). Set `MUSIC_TRACK = "synth"` to force the built-in generator for one video.
   - **Local assets:** `capture.mjs` only serves files inside the video folder (plus `/_lib/`) and blocks `../` paths,
     so keep each template's images and `.woff2` fonts inside its own `assets/` folder.
   - **Caption styling:** customize word-by-word captions in `video.html` with CSS variables `--caption-font`,
     `--caption-bg`, `--caption-on-bg`, and `--caption-on-fg`.
3. Preview before the full render: run `node video/capture.mjs work/<dir> stills 0.5 2 5 9` and look at the images.
   All text must be inside the 1080x1920 frame. Keep important text out of the bottom ~350 px and the right ~150 px,
   because the platform's buttons cover them. If you cannot view images, tell the user to check the stills.
4. Voice-over (optional): `node video/voice.mjs work/<dir>` turns every `LINES[i].text` into `voice/<i>.wav` with
   the provider in `config.json` → `voice` (ElevenLabs, OpenAI, Gemini, Piper, Edge TTS or a local command); `voice.voices`
   maps language codes to voices/models using `LANG`, and a video can override anything with `export const VOICE = {...}`
   in `timeline.mjs`. Each line must fit between its `at` and `until`. When the script says a line is too long, shorten
   the text (better) or raise `speed`. Own recordings in `voice/` are kept. Write numbers, abbreviations and brand names
   the way they should be pronounced.
5. Build: `bash video/build.sh work/<dir>` produces `work/<dir>.mp4` and the cover `work/<dir>.jpg`. Check the cover and a
   few frames before showing the user. Captions are added automatically when there is a voice-over and
   faster-whisper is installed (uses `CAPTION_LANG` env var, `timeline.mjs` `LANG`, or `en`). If you only change the
   music or mix (without changing visual frames or caption timings), run `bash video/build.sh work/<dir> --skip-frames`
   to skip re-rendering frames.
6. No emoji inside `video.html` (headless Chromium draws boxes); use the SVG icons in `video/lib/common.js`.

## Making a carousel or image post

1. Copy `$POSTWEFT_HOME/templates/<name>` or `cp -r video/templates/carousel work/<date>-<slug>`, edit `DATA` in
   `timeline.mjs` (cover hook, one slide per tip, closing call to action). For a single image post, set `TIPS = []` and
   `CLOSING = false`.
2. `node video/capture.mjs work/<dir> slides` writes `work/<dir>-slides/01.jpg, 02.jpg ...` (1080x1350). Look at every
   slide: text must fit and read well on a phone. The cover slide decides whether people swipe.
3. Queue it with `--media work/<dir>-slides` (see Scheduling). Limits: Instagram 2-10 items, Threads 2-20.

## Captions

Write in the brand language from `config.json`. The first line is the hook, because that is what people see. Use
short paragraphs and one clear call to action. Instagram: at most 5 hashtags (the queue script cuts extras), with the
brand tag first. Threads: no hashtags (the topic tag is set in config). Show the user the final text exactly as it
will be posted.

## Scheduling (only after a yes)

```
node bin/queue-add.mjs --platform instagram --video work/<dir>.mp4 --cover work/<dir>.jpg --caption-file work/<dir>.txt
node bin/queue-add.mjs --platform instagram --video work/<dir>.mp4 --cover work/<dir>.jpg --caption-file work/<dir>.txt --trial manual
node bin/queue-add.mjs --platform threads --caption-file work/<dir>-threads.txt
node bin/queue-add.mjs --platform instagram --media work/<dir>-slides --caption-file work/<dir>.txt
node bin/queue-add.mjs --platform youtube --video work/<dir>.mp4 --title "<max 100 chars>" --caption-file work/<dir>-yt.txt
node bin/queue-add.mjs --platform tiktok --video work/<dir>.mp4 --caption-file work/<dir>-tiktok.txt
node bin/queue-add.mjs --platform x --caption-file work/<dir>-x.txt --dry
```

The same video can go to every platform; write the caption for each one. Instagram Trial Reels: pass `--trial manual`
(non-followers only until the user shares it in the app) or `--trial auto` (Instagram shares it to followers if it
performs well); useful for testing hooks without cluttering the profile grid (needs an eligible account, typically
1,000+ followers). YouTube: the title is what people see,
the description can be longer. TikTok: the video arrives in the TikTok app as a draft at the planned time and the user
gets a phone notification with the caption; they paste it and post. Tell the user this when you queue a TikTok post.
X supports text posts with optional links. Preview the exact text, local time and estimated X API charge with
`--dry` before asking for approval. After approval, pass the previewed time with `--at` and omit `--dry`.
The published link appears in the daily summary.

Without `--at` the post goes to the next free best-time slot from `slots.json`. Add `--dry` to see the slot first and
tell the user. To move or cancel a post, edit or delete its file in `queue/`. Only `pending` posts can be changed; a
`prepared` post is already uploaded. Report what was queued (platform, date and time) and write it into `HANDOFF.md`.

## Replies

- `node bin/reply-comments.mjs --dry` and `node bin/reply-dms.mjs --dry` show what would be answered, without sending.
- The AI that writes the replies is set in `config.json` → `ai.provider` (`claude`, `codex`, `gemini` or `command`).
  It follows `prompts/comment-reply.md` and `prompts/dm-reply.md`, plus `brand.md`. When the user disagrees with an
  answer, fix the rule or the brand facts there, then run the dry run again.
- Items the AI is unsure about are sent to the user's phone (ntfy). Complaints, legal and privacy topics are never
  answered automatically.

## Checking how things went

Run `node bin/summary.mjs --print` for the last and next 24 hours. Logs are in `logs/publish.log`, `logs/comments.log`
and `logs/dms.log`. For results, run `node bin/insights.mjs` (best posts, averages per format, best days and hours;
`--days 30`, `--json`). Explain it in plain words; if it suggests better times, propose the `slots.json` change and
apply it only after the user agrees. Few posts give unreliable numbers: say so instead of drawing big conclusions.
`node bin/refresh-tokens.mjs --status` shows when the Threads token expires. A post marked `failed` or `missed` needs the user's decision; do not quietly put it back in the queue.
