# Platform rules (check before every post)

Limits change; when a publish fails with a limit error, believe the error and update this file.

## Instagram
- Reels: vertical 9:16, 1080x1920, H.264 + AAC; short ones (10-30 s) tend to reach more people. Cover: a frame or JPG.
- Caption: max 2,200 characters, **max 5 hashtags** (more are rejected or hurt reach). Put the hook in the first line.
- Stories: 9:16 image or short video; there is no caption, and link stickers cannot be added through the API.
- The API has a daily publishing limit per account; check it with `GET /{ig-user-id}/content_publishing_limit`.
- Keep text away from the bottom ~350 px and the right ~150 px of the video (buttons and caption cover it).
- Comments/DMs: answer like a person; DMs can only be answered within 24 hours of the person's last message.

## Threads
- Text up to 500 characters. Images and videos (9:16 or square) supported.
- The first hashtag becomes the post's topic, so do not put hashtags in the text: set `threads.topicTag` instead.
- The API has daily limits for posts and replies; check them with `GET /me/threads_publishing_limit`.

## TikTok and YouTube Shorts (not automated here)
- Same 9:16 MP4 works. TikTok: max **5 hashtags** as well. YouTube titles: max 100 characters.
- Post them yourself or with their official APIs; do not automate their websites.

## X
- 280 characters (links count as 23, emoji as 2). Not automated here.

## Everywhere
- No other brands' names, logos or music you do not own. The built-in music generator makes license-free music.
- Do not post people's photos, names or private messages without their permission.
- Accessibility: captions on every video with speech, and alt text for images where the platform allows it.
