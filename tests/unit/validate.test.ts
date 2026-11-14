import { describe, expect, it } from "vitest";
import { validateSubmission, type SubmissionInput } from "@/server/testimonials/validate";

const valid: SubmissionInput = {
  name: "Ann Lee",
  email: "ann@example.com",
  roleCompany: "CTO, Acme",
  rating: "5",
  text: "Kindwords made this so easy.",
  consent: true,
};
const errorsFor = (patch: Partial<SubmissionInput>) => {
  const result = validateSubmission({ ...valid, ...patch });
  return "fieldErrors" in result ? Object.keys(result.fieldErrors) : [];
};

describe("validateSubmission (KTD7)", () => {
  it("accepts a valid submission, trimming fields and keeping the text otherwise exact", () => {
    expect(validateSubmission({ ...valid, name: "  Ann  ", text: "  Line one\r\n\r\nLine two\t✓  ", roleCompany: " " })).toEqual({
      values: { name: "Ann", email: "ann@example.com", roleCompany: null, rating: 5, text: "Line one\r\n\r\nLine two\t✓" },
    });
  });

  it("requires consent (R6)", () => {
    expect(errorsFor({ consent: false })).toEqual(["consent"]);
  });

  it.each([
    ["missing name", { name: "  " }, "name"],
    ["81-character name", { name: "x".repeat(81) }, "name"],
    ["missing email", { email: "" }, "email"],
    ["malformed email", { email: "ann@example" }, "email"],
    ["255-character email", { email: `${"a".repeat(243)}@example.com` }, "email"],
    ["rating 0", { rating: "0" }, "rating"],
    ["rating 6", { rating: "6" }, "rating"],
    ["missing rating", { rating: "" }, "rating"],
    ["fractional rating", { rating: "4.5" }, "rating"],
    ["9-character text", { text: "123456789" }, "text"],
    ["text short after trimming", { text: "   short    " }, "text"],
    ["2001-character text", { text: "x".repeat(2001) }, "text"],
    ["121-character role", { roleCompany: "x".repeat(121) }, "roleCompany"],
    ["control character in name", { name: "Ann\u0000" }, "name"],
    ["line break in name", { name: "Ann\nLee" }, "name"],
    ["control character in text", { text: "Great product\u0007!" }, "text"],
    ["control character in role", { roleCompany: "CTO\u001b" }, "roleCompany"],
  ])("refuses a %s", (_label, patch, field) => {
    expect(errorsFor(patch)).toEqual([field]);
  });

  it("counts characters, not UTF-16 units, at the limits", () => {
    expect(errorsFor({ name: "😀".repeat(80), text: "😀".repeat(2000) })).toEqual([]);
    expect(errorsFor({ text: "😀".repeat(10) })).toEqual([]);
    expect(errorsFor({ email: `${"a".repeat(242)}@example.com` })).toEqual([]);
  });

  it("reports every bad field at once", () => {
    expect(errorsFor({ name: "", rating: "9", consent: false }).sort()).toEqual(["consent", "name", "rating"]);
  });

  it("admin mode makes email and rating optional and skips consent (U7)", () => {
    expect(validateSubmission({ ...valid, email: " ", rating: "", consent: false }, "admin")).toEqual({
      values: { name: "Ann Lee", email: null, roleCompany: "CTO, Acme", rating: null, text: valid.text },
    });
    const bad = validateSubmission({ ...valid, email: "nope", rating: "6", text: "short" }, "admin");
    expect("fieldErrors" in bad && Object.keys(bad.fieldErrors).sort()).toEqual(["email", "rating", "text"]);
  });
});
