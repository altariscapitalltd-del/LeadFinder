import dns from "dns/promises";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "guerrillamail.com",
]);

const mxCache = new Map();

export function isEmailFormatValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isDisposableDomain(email) {
  const domain = email.split("@")[1] || "";
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

export async function hasMxRecord(email) {
  const domain = (email.split("@")[1] || "").toLowerCase();
  if (!domain) return false;
  if (mxCache.has(domain)) return mxCache.get(domain);
  try {
    const mx = await dns.resolveMx(domain);
    const ok = Array.isArray(mx) && mx.length > 0;
    mxCache.set(domain, ok);
    return ok;
  } catch {
    mxCache.set(domain, false);
    return false;
  }
}

export async function getValidationTag(email) {
  if (!isEmailFormatValid(email)) return "invalid";
  if (isDisposableDomain(email)) return "risky";
  const hasMx = await hasMxRecord(email);
  return hasMx ? "valid" : "risky";
}
