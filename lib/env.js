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

export function assertProductionEnv() {
  if (validated) return;
  if (process.env.NODE_ENV !== "production") return;

  const appUrl = process.env.APP_URL;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;

  if (!appUrl || !isValidAbsoluteUrl(appUrl)) {
    throw new Error("APP_URL must be set to a valid absolute URL in production.");
  }
  if (!nextAuthSecret || nextAuthSecret.length < 32) {
    throw new Error("NEXTAUTH_SECRET must be set and at least 32 characters in production.");
  }

  validated = true;
}

export function getAppUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

export function allowInvalidSmtpTls() {
  return parseBoolean(process.env.SMTP_ALLOW_INVALID_TLS, false);
}
