# Platform rules (check before every post)

Limits change; when a publish fails with a limit error, believe the error and update this file.

## Instagram
- Reels: vertical 9:16, 1080x1920, H.264 + AAC; short ones (10-30 s) tend to reach more people. Cover: a frame or JPG.
- Trial Reels (`--trial manual` or `--trial auto`): shown only to non-followers first and kept off the profile grid.
  `manual` stays a trial until you share it in the Instagram app; `auto` (`SS_PERFORMANCE`) lets Instagram share it to
  followers automatically if it performs well in the first ~72 hours. Needs an eligible public professional account
  (typically 1,000+ followers) and has a daily cap (~5-20/day). Use it to test hooks or formats, not to spam identical videos.
- Caption: max 2,200 characters, **max 5 hashtags** (more are rejected or hurt reach). Put the hook in the first line.
- Carousels: 2-10 images/videos (Meta has started to allow more; keep 10 until the docs say otherwise). Use 4:5
  (1080x1350) for all slides: the first slide sets the crop for the rest. One caption for the whole carousel.
- Stories: 9:16 image or short video; there is no caption, and link stickers cannot be added through the API.
- The API has a daily publishing limit per account; check it with `GET /{ig-user-id}/content_publishing_limit`.
- Keep text away from the bottom ~350 px and the right ~150 px of the video (buttons and caption cover it).
- Comments/DMs: answer like a person; DMs can only be answered within 24 hours of the person's last message.

## Threads
- Text up to 500 characters. Images and videos (9:16 or square) supported. Carousels: 2-20 images/videos.
- The first hashtag becomes the post's topic, so do not put hashtags in the text: set `threads.topicTag` instead.
- The API has daily limits for posts and replies; check them with `GET /me/threads_publishing_limit`.

## YouTube Shorts
- Vertical 9:16 video up to 3 minutes becomes a Short by itself. Same MP4 as the reel works.
- Title: max 100 characters, no `<` or `>` (the queue script checks). Description: max 5,000 bytes. Up to 3 hashtags
  show above the title; more than 60 hashtags and YouTube ignores all of them. `#Shorts` is optional.
- Scheduled Shorts are uploaded early as private with a publish time; YouTube publishes them itself.
- `madeForKids` in config must be true for content made for children (legal requirement in many countries).
- The API has a daily upload limit per project; a few Shorts a day are fine.

## TikTok (drafts)
- Same 9:16 MP4. Caption max 2,200 characters, **max 5 hashtags** (the queue script cuts extras).
- Without TikTok's app audit, the API can only deliver the video to the app inbox as a draft (this is what we do) or
  post it as private. The user posts it from the app; the caption is sent to their phone to paste.
- Use only music you own or the built-in generator; TikTok's own sounds can be added in the app.
- Do not automate the TikTok website or app.

## X
- Text posts with optional links use a weighted limit of 280 characters. Links count as 23 and emoji as 2.
- `--dry` shows the estimated publish charge in USD. Check [X's usage prices](https://docs.x.com/x-api/getting-started/pricing) when quoting it.
- If publication cannot be confirmed, check the account on X before retrying.

## Everywhere
- No other brands' names, logos or music you do not own. The built-in music generator makes license-free music.
- Do not post people's photos, names or private messages without their permission.
- Accessibility: captions on every video with speech, and alt text for images where the platform allows it.
