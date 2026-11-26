// Starter template: hook -> three points -> call to action. Copy the folder, edit DATA, run video/build.sh <folder>.
// Times are in seconds. The music generator and the effects read the exported arrays below.
export const DATA = {
  hook: "3 things you didn't know about cold brew",
  points: [
    { title: "It's brewed with cold water", note: "12-18 hours, no heat" },
    { title: "Less bitter, naturally sweet", note: "lower acidity than hot coffee" },
    { title: "Keeps for a week", note: "in the fridge, in a closed jar" },
  ],
  cta: "Try ours this weekend",
  handle: "example.com",
};

export const WIDTH = 1080, HEIGHT = 1920, FPS = 30;
export const BPM = 120, BEAT = 0.5, PROG = "bright"; // music mood: "bright" | "calm" | "moody"
export const DURATION = 14;
export const STARTS = [3, 5.5, 8];          // when each point appears
export const END = 10.5;                     // call to action starts here
export const POSTER = 1.6;                   // cover frame
export const MUSIC_UP = DURATION - 1;        // music opens up after the voice is done
export const CAPTION_TOP = 1600;

// Sound effects (music.mjs): pops on entrances, whooshes on cuts, stamp on the hook
export const POPS = [0.3, 0.6, ...STARTS.map((s) => s + 0.1), END + 0.3, END + 0.8];
export const CUTS = [STARTS[0], END];
export const STAMPS = [1.2];

// Voice-over lines: put voice/<index>.wav next to this file (any text-to-speech or your own recording).
// Without voice files the video is music only. "until" is the latest time the line should end.
export const LINES = [
  { at: 0.2, until: 2.8, text: DATA.hook },
  { at: STARTS[0] + 0.2, until: STARTS[1] - 0.1, text: "One: it's brewed with cold water, for twelve hours or more." },
  { at: STARTS[1] + 0.2, until: STARTS[2] - 0.1, text: "Two: it's less bitter and naturally sweet." },
  { at: STARTS[2] + 0.2, until: END - 0.1, text: "Three: it keeps for a week in the fridge." },
  { at: END + 0.3, until: DURATION - 0.5, text: "Try ours this weekend." },
];
