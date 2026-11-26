# First-time setup (guided)

Use this when the data directory has no `config.json`, when `node bin/setup-check.mjs` reports something missing, or
when the user asks to set things up. The user may not be technical: ask in plain words, one or two questions at a
time, in the user's language, and do the file work yourself.

Run `node bin/setup-check.mjs` first and after every step: it is the checklist. It never prints secret values.

## 0. Start
- Find the data directory with `node bin/setup-check.mjs` (default `~/.config/postweft`, override with
  `POSTWEFT_HOME`). If it has no files, copy the
  examples (`config/config.example.json` → `config.json`, `config/slots.example.json` → `slots.json`,
  `config/env.example` → `.env` with `chmod 600`, `prompts/brand.example.md` → `brand.md`). Never overwrite an
  existing file without asking.
- If `HANDOFF.md` says a setup is half done, continue from there instead of starting again.
- Tell the user what is coming: a few questions about the brand (about 10 minutes), then connecting the accounts
  (they do that part on Meta's website; it can take longer), then a test.

## 1. The brand (ask, then write config.json → brand)
- Brand name, the language posts and replies should be in, and the city or time zone (`timezone`, IANA name such as
  `Europe/Istanbul`).
- The brand's own website domain for `allowedLinks` (or none: `[]`).
- Which platforms: Instagram, Threads, YouTube Shorts, TikTok, X. Remove the section of a platform they do not use from
  `config.json` (and its `slots.json` part). Suggest starting with one or two and adding the rest later.

## 2. Brand facts (write brand.md together)
The reply bot knows only this file, so it is worth getting right. Ask, then write short factual bullets:
- What the brand is and sells; where (address, online shop); opening hours; delivery, prices or policies they are
  happy to state publicly.
- What must never be promised (discounts, delivery dates, wholesale...): these questions go to the owner.
- The tone (warm, formal, playful...).
Use only what the user says. Do not fill gaps with guesses; leave a topic out if they do not know. Show the finished
file and ask if anything is wrong.

## 3. Posting times (slots.json)
Ask when their followers are online. If they do not know: Instagram app → Insights (professional dashboard) →
Total followers → Most active times. Until they know, the example windows work as a start; say so. Days are
0 = Sunday ... 6 = Saturday, times in `timezone`.

## 4. Replies, voice and notifications
- Which AI writes the replies (`ai.provider`): `claude` if Claude Code is logged in on this machine (default), `codex`,
  `gemini` (needs `GEMINI_API_KEY`) or `command`. Ask if they want automatic replies at all; if not, set
  `replyToComments: false` and skip the DM job in cron.
- Voice-over (`voice.provider`): none, ElevenLabs, OpenAI, Gemini, Piper, Edge TTS or a local program. ElevenLabs,
  OpenAI and Gemini need a key in `.env`. For offline Piper, choose a voice for the user's language, check its model card, run
  `bash video/install-piper.sh <voice>` and set `voice.provider` to `piper` and `voice.model` to that voice name.
  For online Edge TTS, install the community CLI with `pipx install edge-tts` and set `voice.provider` to `edge-tts`.
  Choose `en-US-AndrewNeural` for English or `tr-TR-AhmetNeural` for Turkish in `voice.voice`.
- Phone notifications: generate the topic yourself (`node -e "console.log('sa-' + require('crypto').randomBytes(12).toString('hex'))"`),
  put it in `notify.ntfyTopic`, and tell the user to install the ntfy app and subscribe to exactly that name.
  Then send a test with `node lib/notify.mjs "Test" "Hello"` after they subscribed.

## 5. Accounts and tokens (the user does this; you guide)
Never ask for a token in the chat and never print `.env`. Tell the user to open the `.env` file themselves (give the
full path) and paste each value after the `=`. If they paste a token into the chat anyway, do not repeat it, tell them
to put it in the file, and suggest creating a new token because the chat copy may be stored.

Meta changes its screens often: give these steps as a guide and link the official pages
(developers.facebook.com/docs/instagram-platform, developers.facebook.com/docs/threads) rather than promising exact
button names.
- **Instagram:** the account must be professional (business or creator) and connected to a Facebook Page. Create an
  app at developers.facebook.com, add Instagram, and create a token with `instagram_basic`,
  `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights` (statistics), and
  `instagram_manage_messages` for DMs, plus `pages_show_list`, `pages_read_engagement`. Best: exchange the user token
  for a long-lived one, then use the **Page access token** made from it (`me/accounts` returns it); that token does
  not expire, so nothing needs to be renewed. The account id for `instagram.userId`: in the
  Graph API Explorer run `me/accounts?fields=instagram_business_account` and copy `instagram_business_account.id`
  (you may do this with the user, but they type the token there, not here).
- **Threads:** in the same or a new app add the Threads use case with `threads_basic`, `threads_content_publish`,
  `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights` (statistics), then create a long-lived
  token.
- The Threads token lasts 60 days. `node bin/refresh-tokens.mjs` renews it (from the second day on) and the weekly
  cron line in `examples/crontab.txt` keeps it alive; if renewing fails the user gets a phone notification.
- **YouTube:** at console.cloud.google.com create a project, enable "YouTube Data API v3", set up the OAuth consent
  screen (External, add the user's own Google account as a test user, then press "Publish app": while the app is in
  "Testing" Google ends the sign-in after 7 days), and create an OAuth client of type **Desktop app**. The user puts
  its client id and secret into `.env` (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`). Then run
  `node bin/connect.mjs youtube`, give the user the link, and wait. Google shows an "unverified app" warning for a
  personal app: Advanced → continue is fine because it is their own app. After "Allow" the browser goes to an address
  starting with `http://127.0.0.1:8765`; on a phone that page does not load. Ask the user to copy that whole address
  and send it, then run `node bin/connect.mjs youtube "<address>"`. It holds a one-time code that expires in minutes
  and only works with the sign-in started on this machine, so it may pass through the chat; the lasting token never
  does.
- **TikTok:** at developers.tiktok.com create an app, add **Login Kit** and **Content Posting API** (scopes
  `user.info.basic`, `video.upload`), and register a redirect address the user owns (any page of their website, for
  example `https://their-site/tiktok-callback`; it does not need to exist). Put it in `config.json` →
  `tiktok.redirectUri`, and the client key and secret into `.env`. Then `node bin/connect.mjs tiktok`, and the same
  copy-the-address step as YouTube. Explain the limit honestly: without TikTok's app review, videos arrive in the
  TikTok app as drafts and the user posts them there (a notification with the caption comes at the planned time).
- **X:** create an app in the [X Developer Console](https://console.x.com/), enable OAuth 2.0 user authentication
  and select Read and Write permissions. Register the exact callback URL in `x.redirectUri` (for example
  `http://127.0.0.1:8766/x-callback`). The user puts `X_CLIENT_ID` into `.env`, plus `X_CLIENT_SECRET` for a
  confidential app. Run `node bin/connect.mjs x`, open the sign-in link and grant access. Paste the redirected
  address into the waiting terminal or run `node bin/connect.mjs x "<address>"` from the same data directory.
  Connect saves the refresh token to `.env`. Enable [API credits](https://docs.x.com/x-api/getting-started/pricing)
  for publishing and set an `x` schedule in `slots.json` or pass `--at` for each post.
- Then run `node bin/setup-check.mjs --online`. It checks configured credentials and verifies supported accounts
  with read-only requests. For X it checks local settings and the presence of the refresh token.

## 6. Media hosting
Instagram and Threads download each video or image from a public URL (YouTube and TikTok do not need this). Ask what
they have:
- a website on the same machine → `media.mode: "dir"` with that folder and its public URL;
- a storage bucket (S3, R2, ...) → `media.mode: "command"` with an upload command that prints the URL;
- nothing → explain that this is needed before videos or images can be posted, and that text posts on Threads work
  without it.

## 7. Test and finish
1. `node bin/setup-check.mjs --online` shows no `MISSING`.
2. A video without any account: `cp -r video/templates/starter work/demo && bash video/build.sh work/demo`.
3. Dry runs: `node bin/reply-comments.mjs --dry` and `node bin/reply-dms.mjs --dry` (shows what would be answered).
4. Offer the cron lines from `examples/crontab.txt` with the real paths. Installing cron starts automatic posting and
   replies, so ask first. Nothing is published until a post is approved and queued.
5. Write a short setup note in `HANDOFF.md`: what is configured, what is left, token expiry dates.
Then suggest a first real step, such as "shall I plan next week?".
