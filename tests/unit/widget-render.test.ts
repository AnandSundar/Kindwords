// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableJavaScriptFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../widget/src/index";
import { EMPTY_TEXT, type PublicItem } from "../../widget/src/render";

const item = (patch: Partial<PublicItem> = {}): PublicItem => ({
  name: "Ann Lee",
  roleCompany: "CTO, Acme",
  rating: 5,
  text: "Kindwords made this so easy.",
  avatarUrl: null,
  featured: false,
  createdAt: "2026-11-01T10:00:00.000Z",
  ...patch,
});

function fakeWindow(opts: { items?: PublicItem[]; fail?: boolean; dark?: boolean } = {}) {
  const fetch = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(async () => {
    if (opts.fail) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ version: 1, testimonials: opts.items ?? [] }), { status: 200 });
  });
  const matchMedia = vi.fn(() => ({ matches: opts.dark ?? false, addEventListener: vi.fn() }));
  return { win: { fetch, matchMedia } as unknown as Window, fetch };
}

function scriptTag(attrs: Record<string, string> = {}) {
  const script = document.createElement("script");
  script.setAttribute("src", "https://reviews.example.com/embed.js");
  script.setAttribute("data-space", "abc_123");
  for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
  document.body.append(script);
  return script;
}

async function mounted(attrs: Record<string, string> = {}, opts: Parameters<typeof fakeWindow>[0] = {}) {
  const script = scriptTag(attrs);
  const { win, fetch } = fakeWindow(opts);
  await mount(script, win);
  const host = script.nextElementSibling!;
  const wall = host.shadowRoot!.querySelector<HTMLElement>(".kw")!;
  return { host, wall, fetch, cards: [...wall.querySelectorAll<HTMLElement>(".kw-card")] };
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("embed widget (U9)", () => {
  it("fetches the space's feed without credentials and renders a card per item in a shadow root", async () => {
    const { host, fetch, cards } = await mounted({}, { items: [item(), item({ name: "Bo" })] });
    expect(host.tagName).toBe("KINDWORDS-WALL");
    expect(String(fetch.mock.calls[0][0])).toBe("https://reviews.example.com/api/public/abc_123/testimonials");
    expect(fetch.mock.calls[0][1]).toEqual({ credentials: "omit" });
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".kw-text")!.textContent).toBe("Kindwords made this so easy.");
    expect(cards[0].querySelector(".kw-stars")!.getAttribute("aria-label")).toBe("5 out of 5 stars");
  });

  it("renders markup in testimonial fields as text and creates no element from it (AE2)", async () => {
    const payload = "<img src=x onerror=alert(1)><script>alert(2)</script>";
    const { wall, cards } = await mounted({}, { items: [item({ name: payload, roleCompany: payload, text: payload })] });
    expect(cards[0].querySelector(".kw-text")!.textContent).toBe(payload);
    expect(cards[0].querySelector(".kw-name")!.textContent).toBe(payload);
    expect(wall.querySelectorAll("img, script")).toHaveLength(0);
  });

  it("only uses http(s) avatar URLs", async () => {
    const { cards } = await mounted({}, {
      items: [item({ avatarUrl: "https://reviews.example.com/media/k1" }), item({ avatarUrl: "javascript:alert(1)" })],
    });
    expect(cards[0].querySelector("img")!.getAttribute("src")).toBe("https://reviews.example.com/media/k1");
    expect(cards[1].querySelector("img")).toBeNull();
    expect(cards[1].querySelector(".kw-avatar")!.textContent).toBe("AL");
  });

  it("asks for featured only and renders only featured cards; the default keeps the feed's featured-first order (AE7)", async () => {
    const items = [item({ name: "Feat", featured: true }), item({ name: "Plain" })];
    const only = await mounted({ "data-featured": "" }, { items });
    expect(String(only.fetch.mock.calls[0][0])).toMatch(/\?featured=1$/);
    expect(only.cards.map((c) => c.querySelector(".kw-name")!.textContent)).toEqual(["Feat"]);
    const all = await mounted({}, { items });
    expect(all.cards.map((c) => c.querySelector(".kw-name")!.textContent)).toEqual(["Feat", "Plain"]);
    expect(all.cards[0].hasAttribute("data-featured")).toBe(true);
  });

  it("is not restyled by the host page's CSS", async () => {
    const style = document.createElement("style");
    style.textContent = "div, figure, blockquote, p { color: red !important; display: none !important }";
    document.head.append(style);
    const control = document.createElement("div");
    document.body.append(control);
    expect(getComputedStyle(control).color).toMatch(/red|255, 0, 0/); // the host rule really applies outside
    const { cards } = await mounted({}, { items: [item()] });
    const text = cards[0].querySelector(".kw-text")!;
    expect(getComputedStyle(text).color).not.toMatch(/red|255, 0, 0/);
    expect(getComputedStyle(cards[0]).display).not.toBe("none");
  });

  it("shows the empty state for 0 items and renders 500 without errors", async () => {
    const empty = await mounted();
    expect(empty.wall.textContent).toBe(EMPTY_TEXT);
    const many = await mounted({}, { items: Array.from({ length: 500 }, (_, i) => item({ name: `Person ${i}` })) });
    expect(many.cards).toHaveLength(500);
  });

  it("applies the chosen theme, and auto follows prefers-color-scheme", async () => {
    expect((await mounted({ "data-theme": "dark" })).wall.dataset.theme).toBe("dark");
    expect((await mounted({ "data-theme": "light" }, { dark: true })).wall.dataset.theme).toBe("light");
    expect((await mounted({}, { dark: true })).wall.dataset.theme).toBe("dark");
    expect((await mounted({ "data-theme": "auto" }, { dark: false })).wall.dataset.theme).toBe("light");
  });

  it("renders the empty state on a failed fetch, a bad space ID or a malformed feed, throwing nothing", async () => {
    const failed = await mounted({}, { fail: true });
    expect(failed.wall.textContent).toBe(EMPTY_TEXT);

    const bad = await mounted({ "data-space": "../../admin" });
    expect(bad.fetch).not.toHaveBeenCalled();
    expect(bad.wall.textContent).toBe(EMPTY_TEXT);

    const script = scriptTag();
    const fetch = vi.fn(async () => new Response("<html>", { status: 200 }));
    await expect(mount(script, { fetch, matchMedia: () => ({ matches: false }) } as unknown as Window)).resolves.toBeUndefined();
    expect(script.nextElementSibling!.shadowRoot!.textContent).toContain(EMPTY_TEXT);
  });

  it("clamps long testimonials behind a Read more toggle and leaves short ones alone", async () => {
    const { cards } = await mounted({}, { items: [item({ text: "Long words here. ".repeat(40) }), item()] });
    const more = cards[0].querySelector<HTMLButtonElement>(".kw-more")!;
    const quote = cards[0].querySelector(".kw-text")!;
    expect(quote.hasAttribute("data-clamp")).toBe(true);
    expect(quote.textContent).toBe("Long words here. ".repeat(40)); // the whole text stays readable to assistive tech
    expect(more.getAttribute("aria-expanded")).toBe("false");
    more.click();
    expect(quote.hasAttribute("data-open")).toBe(true);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(more.textContent).toBe("Show less");
    expect(cards[1].querySelector(".kw-more")).toBeNull();
  });

  it("labels the wall for assistive tech and gives right-to-left text an automatic direction", async () => {
    const { wall, cards } = await mounted({}, { items: [item({ text: "منتج رائع حقا، أنصح به" })] });
    expect(wall.getAttribute("role")).toBe("region");
    expect(wall.getAttribute("aria-label")).toBe("Testimonials");
    expect(cards[0].querySelector(".kw-text")!.getAttribute("dir")).toBe("auto");
  });
});
