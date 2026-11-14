import { renderWall, type PublicItem } from "./render";
import { WALL_CSS } from "./styles";

const SPACE = /^[A-Za-z0-9_-]{1,64}$/;
const FEED_TIMEOUT_MS = 10_000;

/**
 * Mounts one wall after its script tag: a <kindwords-wall> host (a custom tag, so the host page's
 * `div` rules do not reach it) with an open shadow root, then fetches the feed and renders. Any
 * failure ends in the quiet empty state; nothing is thrown into the host page.
 */
export async function mount(script: HTMLScriptElement, win: Window = window): Promise<void> {
  script.dataset.kwMounted = "";
  const doc = script.ownerDocument;
  const host = doc.createElement("kindwords-wall");
  script.after(host);
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = WALL_CSS;
  const wall = doc.createElement("div");
  wall.className = "kw";
  wall.setAttribute("aria-label", "Testimonials");
  wall.setAttribute("role", "region");
  root.append(style, wall);

  const theme = script.dataset.theme;
  if (theme === "light" || theme === "dark") wall.dataset.theme = theme;
  else {
    const dark = win.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => (wall.dataset.theme = dark?.matches ? "dark" : "light");
    apply();
    dark?.addEventListener?.("change", apply);
  }

  const featuredOnly = script.hasAttribute("data-featured") && script.dataset.featured !== "false";
  let items: PublicItem[] = [];
  try {
    const space = script.dataset.space ?? "";
    if (SPACE.test(space)) {
      const url = new URL(`/api/public/${space}/testimonials`, script.src);
      if (featuredOnly) url.searchParams.set("featured", "1");
      // A hung server must not leave the wall blank forever: give up after 10 s and show the empty state.
      const res = await win.fetch(url, { credentials: "omit", signal: globalThis.AbortSignal?.timeout?.(FEED_TIMEOUT_MS) });
      const body = res.ok ? await res.json() : undefined;
      // Drop non-object items: rendering runs outside the try, and a null item must not throw into the page.
      if (body?.version === 1 && Array.isArray(body.testimonials)) items = body.testimonials.filter((i: unknown) => typeof i === "object" && i !== null);
    }
  } catch {
    // Offline, blocked or malformed: show the empty state instead.
  }
  renderWall(doc, wall, featuredOnly ? items.filter((item) => item.featured === true) : items, script.src);
}

if (typeof document !== "undefined") {
  const current = document.currentScript;
  const scripts =
    current instanceof HTMLScriptElement && current.dataset.space !== undefined
      ? [current]
      : Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-space][src*="embed.js"]:not([data-kw-mounted])'));
  for (const script of scripts) void mount(script);
}
