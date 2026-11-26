// Carousel / image template: a cover slide, one slide per tip, and a closing slide.
// Copy the folder, edit DATA, then: node video/capture.mjs <folder> slides  ->  <folder>-slides/01.jpg ...
// One slide only (an image post): keep just the cover by setting TIPS = [] and CLOSING = false.
export const DATA = {
  kicker: "Cold brew guide",
  hook: "3 mistakes that make cold brew bitter",
  tips: [
    { title: "Grinding too fine", note: "Use a coarse grind, like rough sea salt. Fine grounds over-extract." },
    { title: "Steeping too long", note: "12 to 18 hours is enough. After a day it turns harsh." },
    { title: "Skipping the filter", note: "Strain twice: first a sieve, then a paper filter." },
  ],
  cta: "Save this for your next batch",
  handle: "example.com",
};

export const WIDTH = 1080, HEIGHT = 1350; // 4:5, the tallest feed format on Instagram; works on Threads too
export const TIPS = DATA.tips;
export const CLOSING = true;
export const SLIDES = 1 + TIPS.length + (CLOSING ? 1 : 0);
