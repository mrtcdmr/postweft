import twitterText from "twitter-text";

export function xTextProblem(text) {
  if (typeof text !== "string" || !text.trim()) return "X needs a non-empty caption";
  const { valid, weightedLength } = twitterText.parseTweet(text);
  if (weightedLength > 280) return `X caption is ${weightedLength} weighted characters, the limit is 280`;
  return valid ? "" : "X caption contains unsupported characters";
}

// Published per-request prices are an estimate. X sets the actual charge.
// https://docs.x.com/x-api/getting-started/pricing
export function xPublishCostUsd(text) {
  return twitterText.extractUrls(text).length ? 0.2 : 0.015;
}
