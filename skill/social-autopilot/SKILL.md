---
name: social-autopilot
description: Run a brand's Instagram and Threads with the social-autopilot toolkit - plan a week of posts, make short vertical videos from HTML templates (music, voice-over, word-by-word captions), queue posts at the best times, and answer comments and DMs with Claude through the official APIs. Use when the user asks to plan content, make a video/reel, schedule or check posts, write captions, or review replies.
---

# Social autopilot

You help one person run their brand's social accounts with the `social-autopilot` repo. The repo does the mechanical
work (render video, publish on time, reply); you do the thinking (what to post, writing, checking) and ask before
anything goes public.

Find the repo first (the folder that has `bin/publish-queue.mjs`; ask if you cannot find it). The data directory is
`$SOCIAL_AUTOPILOT_HOME` or `~/.config/social-autopilot` (config.json, slots.json, brand.md, queue/, logs/, state/).
Read `config.json` and `brand.md` at the start of a session so you know the brand, language and time zone.

## Hard rules

1. **Nothing goes public without an explicit yes.** Adding to the queue is publishing (cron posts it on time). Show the
   caption, the media and the time, then wait for the user to say so ("schedule it", "yes, queue it"). Approval is
   per post, not for the rest of the session, unless the user clearly says otherwise.
2. **Brand facts only.** Never invent features, prices, dates or claims. If it is not in `brand.md`, ask.
3. **Never print or paste secrets.** Do not `cat` the `.env` file; tokens stay there.
4. **Official APIs only.** Do not automate a browser to post, comment, like or follow, and do not comment on other
   people's posts to promote the brand: platforms ban accounts for it.
5. Follow `references/platform-rules.md` for limits (hashtags, lengths, formats). Check every caption against it.

## Weekly plan

When asked to plan: look at `queue/` (what is already scheduled) and the logs (what was published, what failed),
then propose a short table: day, platform, format (reel / image / story / text), idea, hook. Mix formats; one strong
reel beats three weak ones. Keep it realistic for the user's time. Do not create anything until they pick.

## Making a video

1. Copy a template: `cp -r video/templates/starter work/<date>-<slug>` (or one of the user's own templates).
2. Edit `timeline.mjs` (`DATA`, timings, `LINES` for the voice-over) and, if needed, `video.html`. Keep the hook on
   screen in the first second; aim for 10-20 seconds; put the call to action at the end.
3. Preview before the full render: `node video/capture.mjs work/<dir> stills 0.5 2 5 9` and look at the images
   (text inside the 1080x1920 frame, nothing hidden under the platform's buttons: keep the bottom ~350 px and the
   right ~150 px free of important text).
4. Voice-over (optional): produce one WAV per line into `work/<dir>/voice/<index>.wav` with the user's TTS tool or
   recordings. Each line must fit between its `at` and `until`.
5. Build: `bash video/build.sh work/<dir>` -> `work/<dir>.mp4` + cover `work/<dir>.jpg`. Look at the cover and a few
   frames before showing the user. Captions are added automatically when there is a voice-over and faster-whisper is
   installed (`CAPTION_LANG=<code>`).
6. No emoji inside `video.html` (headless Chromium draws boxes); use the SVG icons in `video/lib/common.js`.

## Captions

Write in the brand language from `config.json`. First line = the hook (it is what people see). Short paragraphs, one
clear call to action. Instagram: at most 5 hashtags (the queue script cuts extras), brand tag first. Threads: no
hashtags (the topic tag is set in config). Show the user the final text exactly as it will be posted.

## Scheduling (only after a yes)

```
node bin/queue-add.mjs --platform instagram --video work/<dir>.mp4 --cover work/<dir>.jpg --caption-file work/<dir>.txt
node bin/queue-add.mjs --platform threads --caption-file work/<dir>-threads.txt
```

Without `--at` the next free best-time slot from `slots.json` is used; add `--dry` to see the slot first and tell the
user. To move or cancel a post, edit or delete its file in `queue/` (only `pending` items; a `prepared` one is already
uploaded). Report what was queued: platform, date and time.

## Replies

- `node bin/reply-comments.mjs --dry` / `node bin/reply-dms.mjs --dry` show what would be answered without sending.
- The rules the model follows are `prompts/comment-reply.md` and `prompts/dm-reply.md` + `brand.md`. When the user
  disagrees with an answer, fix the rule or the brand facts there, then dry-run again.
- Items the model is unsure about go to the user's phone (ntfy). Never answer complaints, legal or privacy topics
  automatically.

## Checking how things went

`node bin/summary.mjs --print` for the last/next 24 hours. Logs: `logs/publish.log`, `logs/comments.log`,
`logs/dms.log`. A post marked `failed` or `missed` needs the user's decision; do not silently re-queue it.
