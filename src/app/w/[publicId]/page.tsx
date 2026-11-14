import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import { getDb } from "@/server/db/client";
import { publicOrigin } from "@/server/origin";
import { publicWall, type PublicTestimonial } from "@/server/testimonials/public-view";
import { EMPTY_TEXT } from "../../../../widget/src/render";
import { hueFor, initials, starCount, WALL_CSS } from "../../../../widget/src/styles";
import { Quote } from "./quote";

type Props = { params: Promise<{ publicId: string }>; searchParams: Promise<{ theme?: string; featured?: string }> };

export const metadata: Metadata = { title: "Testimonials", robots: { index: false } };

// The page itself, around the shared wall CSS; it never scrolls sideways and fills an iframe.
const PAGE_CSS = "body{margin:0}.kw-page{box-sizing:border-box;min-height:100vh;padding:16px;background:var(--page)}.kw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}";

/** R16: the wall as a page, for an iframe or a link to share. Same markup and CSS as the embed, rendered on the server. */
export default async function WallPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const query = await searchParams;
  const theme = query.theme === "light" || query.theme === "dark" ? query.theme : "auto";
  const { spaceName, testimonials } = await publicWall(getDb(), publicId, {
    featuredOnly: query.featured === "1",
    origin: publicOrigin(await headers()),
  });

  return (
    <div className="kw kw-page" data-theme={theme}>
      <style>{WALL_CSS + PAGE_CSS}</style>
      <h1 className="kw-sr">{spaceName ? `What people say about ${spaceName}` : "Testimonials"}</h1>
      {testimonials.length === 0 ? (
        <p className="kw-empty">{EMPTY_TEXT}</p>
      ) : (
        <div className="kw-grid">
          {testimonials.map((t, i) => (
            <Card key={i} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ t }: { t: PublicTestimonial }) {
  const stars = starCount(t.rating);
  return (
    <figure className="kw-card" style={{ "--h": hueFor(t.name) } as CSSProperties} data-featured={t.featured ? "" : undefined}>
      {stars && (
        <p className="kw-stars" role="img" aria-label={`${stars} out of 5 stars`}>
          {"★".repeat(stars)}
          {stars < 5 && <span>{"★".repeat(5 - stars)}</span>}
        </p>
      )}
      <Quote text={t.text} />
      <figcaption className="kw-who">
        {t.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- fixed 256px webp from /media
          <img className="kw-avatar" src={t.avatarUrl} alt="" width={40} height={40} loading="lazy" decoding="async" />
        ) : (
          <span className="kw-avatar" aria-hidden="true">
            {initials(t.name)}
          </span>
        )}
        <span>
          <cite className="kw-name" dir="auto">
            {t.name}
          </cite>
          {t.roleCompany && (
            <span className="kw-role" dir="auto">
              {t.roleCompany}
            </span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
