// Tokens, ids and password hashes with the Web Crypto API, which both Node (next dev) and Cloudflare Workers provide.

const encoder = new TextEncoder();
// Cloudflare Workers cap PBKDF2 at 100,000 iterations.
const ITERATIONS = 100_000;

function base64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const randomToken = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

// Short, URL-safe and unguessable: "lab_Xk3…", "usr_9fQ…".
export const newId = (prefix: string) => `${prefix}_${randomToken(12)}`;

export async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${base64url(salt)}$${base64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !salt || !expected) return false;
  const actual = await derive(password, fromBase64url(salt), Number(iterations));
  const want = fromBase64url(expected);
  // Compare every byte so the time taken doesn't reveal how much matched.
  let diff = actual.length ^ want.length;
  for (let i = 0; i < Math.max(actual.length, want.length); i++) diff |= (actual[i] ?? 0) ^ (want[i] ?? 0);
  return diff === 0;
}
