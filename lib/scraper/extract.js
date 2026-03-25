import * as cheerio from "cheerio";
import { BLOCKED_EMAIL_PREFIXES, ROLE_PREFIXES, PERSONAL_PROVIDERS, SOCIAL_HOSTS } from "./constants.js";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const OBFUSCATED_EMAIL_RE = /\b([A-Z0-9._%+-]+)\s*(?:@|\[at\]|\(at\)|\sat\s)\s*([A-Z0-9.-]+)\s*(?:\.|\[dot\]|\(dot\)|\sdot\s)\s*([A-Z]{2,})\b/gi;

function normalizeEmail(email) {
  return email
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isRoleEmail(email) {
  const local = email.split("@")[0] || "";
  return ROLE_PREFIXES.has(local);
}

function isBlockedEmail(email) {
  const local = email.split("@")[0] || "";
  return BLOCKED_EMAIL_PREFIXES.has(local);
}

function inferProfession(text) {
  const t = text.toLowerCase();
  if (t.includes("developer") || t.includes("engineer")) return "Developer";
  if (t.includes("designer")) return "Designer";
  if (t.includes("founder")) return "Founder";
  if (t.includes("freelance")) return "Freelancer";
  if (t.includes("marketer") || t.includes("growth")) return "Marketer";
  if (t.includes("agency")) return "Agency";
  return null;
}

function inferCountry(text) {
  const checks = [
    "usa",
    "united states",
    "uk",
    "united kingdom",
    "canada",
    "germany",
    "nigeria",
    "india",
    "france",
    "australia",
  ];
  const t = text.toLowerCase();
  const hit = checks.find((c) => t.includes(c));
  if (!hit) return null;
  if (hit === "united states") return "USA";
  if (hit === "united kingdom") return "UK";
  return hit.toUpperCase() === "UK" ? "UK" : hit[0].toUpperCase() + hit.slice(1);
}

function extractSocialLinks($, baseUrl) {
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;
    try {
      const url = new URL(href, baseUrl).toString();
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (SOCIAL_HOSTS.some((h) => host.includes(h))) links.add(url);
    } catch {}
  });
  return [...links];
}

function findName($) {
  const og = $('meta[property="og:title"]').attr("content");
  if (og) return og.slice(0, 120).trim();
  const h1 = $("h1").first().text().trim();
  if (h1) return h1.slice(0, 120);
  const title = $("title").first().text().trim();
  if (!title) return null;
  return title.split("|")[0].split("-")[0].trim().slice(0, 120);
}

function scorePersonalness(email, sourceUrl, text, socialLinks) {
  let score = 40;
  const domain = email.split("@")[1] || "";
  if (PERSONAL_PROVIDERS.includes(domain)) score += 25;
  if (/portfolio|about|projects|freelance/i.test(sourceUrl)) score += 10;
  if (/github/i.test(text) || socialLinks.some((s) => s.includes("github.com"))) score += 10;
  if (isRoleEmail(email)) score -= 25;
  if (isBlockedEmail(email)) score = 0;
  return Math.max(0, Math.min(100, score));
}

function decodeObfuscatedEmails(text) {
  const found = [];
  let match;
  while ((match = OBFUSCATED_EMAIL_RE.exec(text))) {
    found.push(`${match[1]}@${match[2]}.${match[3]}`);
  }
  return found;
}

export function extractLeadCandidates(html, sourceUrl) {
  const $ = cheerio.load(html);
  const text = $("body").text().slice(0, 30000);
  const name = findName($);
  const profession = inferProfession(text);
  const country = inferCountry(text);
  const socialLinks = extractSocialLinks($, sourceUrl);
  const website = new URL(sourceUrl).origin;

  const found = new Set();
  const matches = [
    ...(html.match(EMAIL_RE) || []),
    ...decodeObfuscatedEmails($.text()),
    ...$('a[href^="mailto:"]').map((_, el) => $(el).attr("href") || "").get(),
  ];
  for (const raw of matches) {
    const email = normalizeEmail(raw);
    if (isBlockedEmail(email)) continue;
    found.add(email);
  }

  return [...found].map((email) => ({
    email,
    name,
    profession,
    country,
    source_url: sourceUrl,
    social_links: socialLinks,
    website,
    score: scorePersonalness(email, sourceUrl, text, socialLinks),
  }));
}
