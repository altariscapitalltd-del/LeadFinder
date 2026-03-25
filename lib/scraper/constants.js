export const ROLE_PREFIXES = new Set([
  "info",
  "support",
  "sales",
  "admin",
  "contact",
  "hello",
]);

export const BLOCKED_EMAIL_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
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

export const SEARCH_SOURCE_HOSTS = [
  "duckduckgo.com",
  "www.bing.com",
];

export const USER_AGENTS = [
  "LeadForgeBot/1.0 (+https://leadforge.local)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
];

export const HIGH_VALUE_PATH_HINTS = [
  "/contact",
  "/about",
  "/team",
  "/company",
  "/people",
  "/staff",
  "/community",
  "/directory",
  "/author",
  "/contributors",
];

export const API_PATH_HINTS = [
  "/api/",
  "graphql",
  ".json",
  "/wp-json/",
];

export const SPEED_DELAYS = {
  slow: 1800,
  normal: 800,
  aggressive: 250,
};

export const MAX_RETRIES = 2;
