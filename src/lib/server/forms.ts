// Small helpers for reading and checking form input in server actions.

export const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
export const passwordProblem = (p: string) =>
  p.length < 10 ? "Use at least 10 characters for the password." : p.length > 200 ? "That password is too long." : null;
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export type FormState = { error?: string; ok?: string; link?: string } | undefined;
