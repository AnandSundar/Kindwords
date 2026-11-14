export type SubmissionInput = {
  name: string;
  email: string;
  roleCompany: string;
  rating: string;
  text: string;
  consent: boolean;
};

export type ValidSubmission = {
  name: string;
  email: string | null;
  roleCompany: string | null;
  rating: number | null;
  text: string;
};

export type FieldErrors = Partial<Record<keyof SubmissionInput | "avatar", string>>;

const chars = (s: string) => [...s].length;
// Line breaks and tabs are allowed in the testimonial text only; every other control character is refused.
const CONTROL = /\p{Cc}/u;
const TEXT_CONTROL = /[^\P{Cc}\t\n\r]/u;

/**
 * KTD7 field rules. Text is trimmed and otherwise stored exactly as submitted (KTD10). In "admin" mode
 * (edit and manual add, U7) email and rating are optional and consent is not asked: the admin attests.
 */
export function validateSubmission(
  input: SubmissionInput,
  mode: "public" | "admin" = "public",
): { values: ValidSubmission } | { fieldErrors: FieldErrors } {
  const admin = mode === "admin";
  const name = input.name.trim();
  const email = input.email.trim();
  const roleCompany = input.roleCompany.trim();
  const text = input.text.trim();
  const fieldErrors: FieldErrors = {};

  if (!name) fieldErrors.name = "Enter your name.";
  else if (chars(name) > 80) fieldErrors.name = "Keep your name to 80 characters or fewer.";
  else if (CONTROL.test(name)) fieldErrors.name = "Your name contains characters that are not allowed.";

  if (!email) {
    if (!admin) fieldErrors.email = "Enter your email address.";
  } else if (chars(email) > 254 || CONTROL.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address, like name@example.com.";
  }

  if (chars(roleCompany) > 120) fieldErrors.roleCompany = "Keep your role and company to 120 characters or fewer.";
  else if (CONTROL.test(roleCompany)) fieldErrors.roleCompany = "Your role or company contains characters that are not allowed.";

  if (!(admin && !input.rating) && !/^[1-5]$/.test(input.rating)) fieldErrors.rating = "Choose a rating from 1 to 5 stars.";

  if (chars(text) < 10) fieldErrors.text = "Write at least 10 characters.";
  else if (chars(text) > 2000) fieldErrors.text = "Keep your testimonial to 2000 characters or fewer.";
  else if (TEXT_CONTROL.test(text)) fieldErrors.text = "Your testimonial contains characters that are not allowed.";

  if (!admin && !input.consent) fieldErrors.consent = "Tick the box to agree that we may show your testimonial.";

  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return {
    values: { name, email: email || null, roleCompany: roleCompany || null, rating: input.rating ? Number(input.rating) : null, text },
  };
}
