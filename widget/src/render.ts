import { CLAMP_CHARS, hueFor, initials, MORE_LABEL, starCount } from "./styles";

/** One item of the public feed (KTD9). Fields are checked again here because the widget trusts no input. */
export type PublicItem = {
  name: string;
  roleCompany: string | null;
  rating: number | null;
  text: string;
  avatarUrl: string | null;
  featured: boolean;
  createdAt: string;
};

export const EMPTY_TEXT = "No testimonials yet.";

/** KTD10: every piece of submitted text goes in through textContent, never as markup. */
function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text?: unknown) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

export function card(doc: Document, item: PublicItem): HTMLElement {
  const name = String(item.name ?? "");
  const figure = el(doc, "figure", "kw-card");
  figure.style.setProperty("--h", String(hueFor(name)));
  if (item.featured === true) figure.dataset.featured = "";

  const stars = starCount(item.rating);
  if (stars) {
    const row = el(doc, "p", "kw-stars", "★".repeat(stars));
    row.setAttribute("role", "img");
    row.setAttribute("aria-label", `${stars} out of 5 stars`);
    if (stars < 5) row.append(el(doc, "span", "", "★".repeat(5 - stars)));
    figure.append(row);
  }

  const quote = el(doc, "blockquote", "kw-text", item.text ?? "");
  quote.dir = "auto";
  figure.append(quote);
  if (String(item.text ?? "").length > CLAMP_CHARS) {
    quote.dataset.clamp = "";
    const more = el(doc, "button", "kw-more", MORE_LABEL[0]);
    more.type = "button";
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", () => {
      const open = quote.toggleAttribute("data-open");
      more.setAttribute("aria-expanded", String(open));
      more.textContent = MORE_LABEL[open ? 1 : 0];
    });
    figure.append(more);
  }

  const who = el(doc, "figcaption", "kw-who");
  const avatarUrl = typeof item.avatarUrl === "string" && /^https?:\/\//.test(item.avatarUrl) ? item.avatarUrl : undefined;
  if (avatarUrl) {
    const img = el(doc, "img", "kw-avatar");
    img.src = avatarUrl;
    img.alt = "";
    img.width = img.height = 40;
    img.loading = "lazy";
    img.decoding = "async";
    who.append(img);
  } else {
    const disc = el(doc, "span", "kw-avatar", initials(name));
    disc.setAttribute("aria-hidden", "true");
    who.append(disc);
  }
  const names = el(doc, "span", "");
  const cite = el(doc, "cite", "kw-name", name);
  cite.dir = "auto";
  names.append(cite);
  if (item.roleCompany) {
    const role = el(doc, "span", "kw-role", item.roleCompany);
    role.dir = "auto";
    names.append(role);
  }
  who.append(names);
  figure.append(who);
  return figure;
}

/** Replaces the wall's content with the cards, or the quiet empty state. */
export function renderWall(doc: Document, wall: HTMLElement, items: PublicItem[]): void {
  if (!items.length) {
    wall.replaceChildren(el(doc, "p", "kw-empty", EMPTY_TEXT));
    return;
  }
  const grid = el(doc, "div", "kw-grid");
  for (const item of items) grid.append(card(doc, item));
  wall.replaceChildren(grid);
}
