// Shared helpers for templates. Every frame is a pure function of time: window.render(t).
// No emoji (headless Chromium may draw empty boxes): use the SVG icons below.

const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const P = (t, s, d) => clamp((t - s) / d);                 // progress 0..1 of an animation starting at s, lasting d
const eOut = (x) => 1 - (1 - x) ** 3;
const eIn = (x) => x * x * x;
const eBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

// Apply a transform: T(el, { x, y, s (scale), r (rotate deg), o (opacity) })
function T(el, { x = 0, y = 0, s = 1, r = 0, o = 1 } = {}) {
  el = typeof el === "string" ? $(el) : el;
  el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`;
  el.style.opacity = o;
}
const pop = (t, s, d = 0.3) => { const k = P(t, s, d); return { s: 0.55 + 0.45 * eBack(k), o: clamp(k * 5) }; };
const slideIn = (t, s, dx = 0, dy = 0, d = 0.32) => { const k = eOut(P(t, s, d)); return { x: dx * (1 - k), y: dy * (1 - k), o: clamp(P(t, s, d) * 4) }; };
const stampIn = (t, s) => { const k = P(t, s, 0.14); return { s: 1 + 1.4 * (1 - eOut(k)), o: t < s ? 0 : clamp(k * 3) }; };
const outUp = (st, t, s, d = 0.22) => { const k = eIn(P(t, s, d)); return { ...st, y: (st.y || 0) - 160 * k, o: (st.o ?? 1) * (1 - k) }; };
const show = (id, on) => { $(id).style.visibility = on ? "visible" : "hidden"; };
// Show scenes by time range: scenes(t, [[id, start, end], ...])
const scenes = (t, list) => { for (const [id, a, b] of list) show(id, t >= a && t < b); };
// Small shake on impact moments
const shake = (t, hits) => { let v = 0; for (const s of hits) if (t >= s && t < s + 0.22) v += Math.sin((t - s) * 90) * 10 * (1 - (t - s) / 0.22); return v; };
// Typewriter: visible part of text at time t
const typedAt = (text, t, s, e) => (t < s ? "" : text.slice(0, Math.round(clamp((t - s) / (e - s)) * text.length)));

// Simple 24x24 line icons
const I = (body, fill = "none", stroke = "#111", w = 2.4) => `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  check: (c = "#111") => I('<path d="M5 12.5l4.5 4.5L19 7.5"/>', "none", c, 3),
  star: (c = "#111", f = "#ffe14d") => I('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', f, c),
  heart: (c = "#111", f = "#ff6f59") => I('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', f, c),
  pin: (c = "#111", f = "#ffb547") => I('<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4" fill="#fff"/>', f, c),
  arrow: (c = "#111") => I('<path d="M5 12h14M13 6l6 6-6 6"/>', "none", c, 3),
};
const ico = (svg, size = 48) => `<span class="ico" style="width:${size}px;height:${size}px">${svg}</span>`;

// Resolves when all images are loaded (use as part of window.ready)
const imagesReady = () => Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; }))));
