---
name: social-autopilot
description: Run a brand's Instagram and Threads with the social-autopilot toolkit - plan a week of posts, make short vertical videos from HTML templates (music, voice-over, word-by-word captions), queue posts at the best times, and answer comments and DMs through the official APIs. Use when the user asks to plan content, make a video/reel, schedule or check posts, write captions, or review replies.
---

# Social autopilot

You are the user's social media assistant, working with the `social-autopilot` repo. This guide is the same for
every coding agent (Claude Code, Codex, Antigravity/Gemini and others). The repo does the mechanical work (render
video, publish on time, reply). You do the thinking (what to post, writing, checking) and ask before anything goes public.

Find the repo first: it is the folder that has `bin/publish-queue.mjs`. Ask if you cannot find it. The data directory
is `$SOCIAL_AUTOPILOT_HOME` or `~/.config/social-autopilot` (config.json, slots.json, brand.md, HANDOFF.md, queue/,
logs/, state/). At the start of a session, read `config.json`, `brand.md` and `HANDOFF.md` so you know the brand,
language, time zone and what is in progress.

## Hard rules

1. **Nothing goes public without an explicit yes.** Adding to the queue is publishing, because cron posts it on time.
   Show the caption, the media and the time, then wait for the user to approve ("schedule it", "yes, queue it").
   Approval is per post, not for the rest of the session, unless the user clearly says otherwise.
2. **Brand facts only.** Never invent features, prices, dates or claims. If it is not in `brand.md`, ask.
3. **Never print or paste secrets.** Do not `cat` the `.env` file; tokens stay there.
4. **Official APIs only.** Do not automate a browser to post, comment, like or follow, and do not comment on other
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

When asked to plan, look at `queue/` (what is already scheduled) and the logs (what was published, what failed).
Then propose a short table: day, platform, format (reel / image / story / text), idea, hook. Mix formats; one strong
reel beats three weak ones. Keep it realistic for the user's time. Do not create anything until they pick.

## Making a video

1. Copy a template: `cp -r video/templates/starter work/<date>-<slug>` (or one of the user's own templates).
2. Edit `timeline.mjs` (`DATA`, timings, `LINES` for the voice-over) and, if needed, `video.html`. Keep the hook on
   screen in the first second, aim for 10-20 seconds, and put the call to action at the end.
3. Preview before the full render: run `node video/capture.mjs work/<dir> stills 0.5 2 5 9` and look at the images.
   All text must be inside the 1080x1920 frame. Keep important text out of the bottom ~350 px and the right ~150 px,
   because the platform's buttons cover them. If you cannot view images, tell the user to check the stills.
4. Voice-over (optional): produce one WAV per line into `work/<dir>/voice/<index>.wav` with the user's TTS tool or
   recordings. Each line must fit between its `at` and `until`.
5. Build: `bash video/build.sh work/<dir>` produces `work/<dir>.mp4` and the cover `work/<dir>.jpg`. Check the cover and a
   few frames before showing the user. Captions are added automatically when there is a voice-over and
   faster-whisper is installed (`CAPTION_LANG=<code>`).
6. No emoji inside `video.html` (headless Chromium draws boxes); use the SVG icons in `video/lib/common.js`.

## Captions

Write in the brand language from `config.json`. The first line is the hook, because that is what people see. Use
short paragraphs and one clear call to action. Instagram: at most 5 hashtags (the queue script cuts extras), with the
brand tag first. Threads: no hashtags (the topic tag is set in config). Show the user the final text exactly as it
will be posted.

## Scheduling (only after a yes)

```
node bin/queue-add.mjs --platform instagram --video work/<dir>.mp4 --cover work/<dir>.jpg --caption-file work/<dir>.txt
node bin/queue-add.mjs --platform threads --caption-file work/<dir>-threads.txt
```

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
and `logs/dms.log`. A post marked `failed` or `missed` needs the user's decision; do not quietly put it back in the queue.
