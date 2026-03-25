const isProductionMode = process.argv.includes("--production") || process.env.NODE_ENV === "production";

function fail(message) {
  console.error(`ENV validation failed: ${message}`);
  process.exit(1);
}

function hasValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

if (!isProductionMode) {
  console.log("ENV validation skipped (not in production mode).");
  process.exit(0);
}

const appUrl = process.env.APP_URL;
const nextAuthSecret = process.env.NEXTAUTH_SECRET;
const dbPath = process.env.DATABASE_PATH || "./leadforge.db";

if (!appUrl || !hasValidUrl(appUrl)) {
  fail("APP_URL must be set to a valid absolute URL in production.");
}

if (!nextAuthSecret || nextAuthSecret.length < 32) {
  fail("NEXTAUTH_SECRET must be set and at least 32 characters in production.");
}

if (!dbPath) {
  fail("DATABASE_PATH must not be empty.");
}

console.log("ENV validation passed.");
