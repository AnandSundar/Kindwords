import type { CSSProperties } from "react";

// Radio and checkbox rows: the whole label is the click target, at least 44px tall (WCAG 2.5.5).
export const choiceLabel: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  minHeight: 44,
  paddingInlineEnd: "0.75rem",
  cursor: "pointer",
};

export const choiceInput: CSSProperties = { width: 20, height: 20, margin: 0, flexShrink: 0 };
