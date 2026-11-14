/**
 * The wall's look, shared by the embed (inside its shadow root) and the server-rendered wall page.
 * Sizes are px so the host page's root font size cannot distort the wall; a host may pass its own
 * font through the `--kindwords-font` custom property, which crosses the shadow boundary.
 */
const LIGHT = "--card:#fff;--ink:#1c2422;--muted:#5d6864;--line:#dde3e0;--star:#a86f00;--star-off:#8a9490;--page:#f3f5f4;--disc-l:35%;--disc-ink:#fff";
const DARK = "--card:#1a201f;--ink:#e9eeec;--muted:#a3ada9;--line:#2e3735;--star:#f0b43a;--star-off:#6b7672;--page:#121716;--disc-l:66%;--disc-ink:#121716";

export const WALL_CSS = `
:host{display:block}
.kw{${LIGHT};font:15px/1.6 var(--kindwords-font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color:var(--ink);text-align:start;-webkit-text-size-adjust:100%}
.kw[data-theme=dark]{${DARK}}
@media (prefers-color-scheme:dark){.kw[data-theme=auto]{${DARK}}}
.kw *{box-sizing:border-box;margin:0;padding:0}
.kw-grid{columns:280px;column-gap:16px}
.kw-card{display:grid;gap:14px;break-inside:avoid;margin:0 0 16px;padding:20px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-wrap:anywhere}
.kw-card[data-featured]{border-color:hsl(var(--h) 42% 50% / .6);box-shadow:inset 3px 0 0 hsl(var(--h) 42% 50%)}
.kw-stars{color:var(--star);font-size:15px;letter-spacing:2px;line-height:1}
.kw-stars span{color:var(--star-off)}
.kw-text{white-space:pre-line;font-size:15px}
.kw-text[data-clamp]{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:9;overflow:hidden}
.kw-text[data-open]{display:block}
.kw-more{justify-self:start;display:inline-flex;align-items:center;min-height:44px;margin:-14px 0 -10px;padding:0;border:0;background:none;color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:4px;cursor:pointer}
.kw-more:hover{text-decoration-color:currentColor}
.kw-more:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:4px}
.kw-who{display:flex;align-items:center;gap:12px;min-width:0}
.kw-avatar{flex:none;width:40px;height:40px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:hsl(var(--h) 34% var(--disc-l));color:var(--disc-ink);font-weight:600;font-size:15px;line-height:1}
.kw-name{display:block;font-weight:600;font-style:normal;line-height:1.35}
.kw-role{display:block;color:var(--muted);font-size:13.5px;line-height:1.35}
.kw-empty{padding:32px 0;color:var(--muted);text-align:center}
`;

/** Testimonials longer than this are clamped to nine lines behind a "Read more" button. */
export const CLAMP_CHARS = 360;
export const MORE_LABEL = ["Read more", "Show less"] as const;

// Muted teal, green, olive, blue, rose, cyan, ochre: no violet (house rule), no terracotta.
const HUES = [172, 142, 88, 212, 350, 194, 42];

/** A stable hue for an author, so a name always gets the same colour. */
export function hueFor(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return HUES[hash % HUES.length];
}

/** Up to two initials, counting emoji and accented letters as one character each. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toUpperCase();
}

/** 1–5 whole stars, or undefined when the testimonial has no rating. */
export function starCount(rating: unknown): number | undefined {
  return typeof rating === "number" && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined;
}
