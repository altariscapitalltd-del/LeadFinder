function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function isValidAbsoluteUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

let validated = false;
let warned = false;

export function assertProductionEnv() {
  if (validated) return;
  if (process.env.NODE_ENV !== "production") return;

  const appUrl = process.env.APP_URL;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;

  if ((!appUrl || !isValidAbsoluteUrl(appUrl)) || (!nextAuthSecret || nextAuthSecret.length < 32)) {
    if (!warned) {
      warned = true;
      console.warn("[leadforge] Production env is incomplete. APP_URL and NEXTAUTH_SECRET should be configured for full production readiness.");
    }
    return;
  }

  validated = true;
}

export function getAppUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

export function allowInvalidSmtpTls() {
  return parseBoolean(process.env.SMTP_ALLOW_INVALID_TLS, false);
}
