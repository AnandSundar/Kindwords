import type { TestimonialStatus } from "../db/repositories/testimonials";

export const STATUSES: readonly TestimonialStatus[] = ["pending", "approved", "rejected"];

export const isStatus = (value: unknown): value is TestimonialStatus => STATUSES.includes(value as TestimonialStatus);

/**
 * R25: any status may move to any other. Featured is only ever true while approved, so moving to
 * anything but approved clears it, and re-approving leaves it unfeatured (AE8).
 */
export function statusPatch(next: TestimonialStatus): { status: TestimonialStatus; featured?: false } {
  return next === "approved" ? { status: next } : { status: next, featured: false };
}
