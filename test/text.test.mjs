import { test } from "node:test";
import assert from "node:assert/strict";
import { limitHashtags, threadsText, mask, safeReply, captionProblem } from "../lib/text.mjs";

test("limitHashtags keeps the first five", () => {
  assert.equal(limitHashtags("Hi #a #b #c #d #e #f #g"), "Hi #a #b #c #d #e");
  assert.equal(limitHashtags("no tags"), "no tags");
});

test("threadsText removes hashtags and hashtag-only lines", () => {
  assert.equal(threadsText("Hello #coffee world\n\n#a #b"), "Hello world");
});

test("mask hides e-mails and phone numbers", () => {
  assert.equal(mask("mail me at a.b@example.com or +1 (555) 123-4567"), "mail me at <email> or <phone>");
});

test("safeReply blocks foreign links, mentions and hashtags", () => {
  const allowed = ["example.com"];
  assert.equal(safeReply("Thanks! See example.com", { allowed }), true);
  assert.equal(safeReply("Go to other.com", { allowed }), false);
  assert.equal(safeReply("hi @someone", { allowed }), false);
  assert.equal(safeReply("#ad", { allowed }), false);
  assert.equal(safeReply("x", { allowed }), false);
});

test("captionProblem checks platform length limits", () => {
  assert.equal(captionProblem("threads", "x".repeat(500)), "");
  assert.match(captionProblem("threads", "x".repeat(501)), /501 characters, the limit is 500/);
  assert.equal(captionProblem("threads", "x".repeat(495) + " #coffee #tea"), ""); // hashtags are not posted on Threads
  assert.equal(captionProblem("instagram", "x".repeat(2200)), "");
  assert.match(captionProblem("instagram", "x".repeat(2201)), /limit is 2200/);
});
