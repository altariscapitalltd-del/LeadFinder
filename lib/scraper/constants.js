export const ROLE_PREFIXES = new Set([
  "info",
  "support",
  "sales",
  "admin",
  "contact",
  "noreply",
  "no-reply",
  "hello",
]);

export const PERSONAL_PROVIDERS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "protonmail.com",
  "proton.me",
  "icloud.com",
];

export const BLOCKED_PATH_PARTS = [
  "/login",
  "/signin",
  "/sign-in",
  "/account",
  "/private",
  "/checkout",
];

export const SOCIAL_HOSTS = [
  "github.com",
  "stackoverflow.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "dribbble.com",
  "behance.net",
  "dev.to",
  "medium.com",
];

export const SPEED_DELAYS = {
  slow: 1800,
  normal: 800,
  aggressive: 250,
};

export const MAX_RETRIES = 2;
