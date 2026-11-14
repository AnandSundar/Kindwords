import { describe, expect, it } from "vitest";
import { isStatus, statusPatch, STATUSES } from "@/server/testimonials/status";

describe("status transitions (R25)", () => {
  it("allows every status to move to every other", () => {
    for (const next of STATUSES) expect(statusPatch(next).status).toBe(next);
  });

  it("clears featured when leaving approved, and leaves it alone when (re)approving", () => {
    expect(statusPatch("pending")).toEqual({ status: "pending", featured: false });
    expect(statusPatch("rejected")).toEqual({ status: "rejected", featured: false });
    expect(statusPatch("approved")).toEqual({ status: "approved" });
  });

  it("recognises only the three statuses", () => {
    expect(STATUSES.every(isStatus)).toBe(true);
    for (const value of ["all", "Approved", "", undefined, null, 1]) expect(isStatus(value)).toBe(false);
  });
});
