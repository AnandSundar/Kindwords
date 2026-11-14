"use client";

import { useState } from "react";
import { CLAMP_CHARS, MORE_LABEL } from "../../../../widget/src/styles";

/** The testimonial text; long ones are clamped behind a toggle, matching the embed. */
export function Quote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > CLAMP_CHARS;
  return (
    <>
      <blockquote className="kw-text" dir="auto" data-clamp={long ? "" : undefined} data-open={open ? "" : undefined}>
        {text}
      </blockquote>
      {long && (
        <button type="button" className="kw-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {MORE_LABEL[open ? 1 : 0]}
        </button>
      )}
    </>
  );
}
