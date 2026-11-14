import { describe, expect, it } from "vitest";
import type { Testimonial } from "@/server/db/repositories/testimonials";
import { PUBLIC_KEYS, toPublic } from "@/server/testimonials/public-view";

const full: Testimonial = {
  id: "t1",
  spaceId: "s1",
  status: "approved",
  featured: true,
  name: "Ann",
  roleCompany: "CTO",
  email: "ann@example.com",
  rating: 4,
  text: "Edited words.",
  originalText: "Original words.",
  avatarKey: "abc",
  createdAt: Date.UTC(2026, 10, 1),
  updatedAt: Date.UTC(2026, 10, 2),
};

describe("public read model (KTD9)", () => {
  it("returns exactly the allowlisted keys, even when given a whole row with email and original text", () => {
    const item = toPublic(full, "https://r.example.com");
    expect(Object.keys(item).sort()).toEqual([...PUBLIC_KEYS].sort());
    const json = JSON.stringify(item);
    expect(json).not.toContain("ann@example.com");
    expect(json).not.toContain("Original words.");
    expect(item).toEqual({
      name: "Ann",
      roleCompany: "CTO",
      rating: 4,
      text: "Edited words.",
      avatarUrl: "https://r.example.com/media/abc",
      featured: true,
      createdAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("gives a null avatar URL when there is no avatar", () => {
    expect(toPublic({ ...full, avatarKey: null }, "https://r.example.com").avatarUrl).toBeNull();
  });
});
