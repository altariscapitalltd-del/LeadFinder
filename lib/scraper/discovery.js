import * as cheerio from "cheerio";
import { complete } from "../ai.js";

function safeKeyword(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

async function normalizeIntent(config) {
  const raw = safeKeyword(config.keyword);
  if (!raw) return raw;
  if (raw.split(" ").length <= 5 && !/[.,!?]/.test(raw)) return raw;

  try {
    const text = await complete({
      system: "Convert an operator's freeform lead request into a short public-web discovery topic. Return only JSON: {\"topic\":\"short phrase\"}. No markdown.",
      prompt: `Request: ${raw}
Industry: ${config.industry}
Country: ${config.country}
Region: ${config.region}

Return a concise search topic that preserves the core niche, audience, and geography.`,
      maxTokens: 80,
    });
    const parsed = JSON.parse(String(text || "").replace(/```json|```/g, "").trim());
    return safeKeyword(parsed?.topic || raw);
  } catch {
    return raw;
  }
}

function fallbackQueries({ keyword, industry, country, region }) {
  const base = safeKeyword([keyword, industry !== "all" ? industry : "", country !== "all" ? country : "", region !== "all" ? region : ""].filter(Boolean).join(" "));
  const stems = [
    `${base} contact email`,
    `${base} founder email`,
    `${base} company contact`,
    `${base} team page email`,
    `${base} directory email`,
    `${base} filetype:pdf email`,
    `${base} contact us`,
    `${base} about us email`,
    `${base} agency founder`,
    `${base} portfolio contact`,
  ];
  return [...new Set(stems.map((q) => q.trim()).filter(Boolean))].slice(0, 6);
}

async function planQueries(config) {
  const fallback = fallbackQueries(config);
  if (!safeKeyword(config.keyword)) return fallback;

  try {
    const text = await complete({
      system: "You plan public-web lead discovery. Return only JSON: {\"queries\": [\"...\"]}. Keep each query short and focused on finding publicly listed email/contact pages. No markdown.",
      prompt: `Keyword: ${config.keyword}
Industry: ${config.industry}
Country: ${config.country}
Region: ${config.region}

Create up to 6 search queries for discovering public websites, directories, company pages, founder pages, team pages, contact pages, and PDFs likely to contain public email addresses.`,
      maxTokens: 250,
    });
    const parsed = JSON.parse(String(text || "").replace(/```json|```/g, "").trim());
    const queries = Array.isArray(parsed?.queries) ? parsed.queries.map((q) => safeKeyword(q)).filter(Boolean) : [];
    return queries.length ? queries.slice(0, 6) : fallback;
  } catch {
    return fallback;
  }
}

function cleanSearchResultUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("duckduckgo.com") && parsed.pathname === "/l/") {
      const target = parsed.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    if (parsed.hostname.includes("bing.com") && parsed.searchParams.get("u")) {
      return parsed.searchParams.get("u");
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isUsefulTarget(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if ([
      "duckduckgo.com",
      "bing.com",
      "www.bing.com",
      "google.com",
      "www.google.com",
    ].includes(host)) return false;
    if (/\.(jpg|jpeg|png|gif|svg|zip)$/i.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function expandHighValuePaths(url) {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    return [
      origin,
      `${origin}/contact`,
      `${origin}/about`,
      `${origin}/team`,
      `${origin}/privacy`,
      `${origin}/contact-us`,
      `${origin}/about-us`,
    ];
  } catch {
    return [url];
  }
}

async function fetchHtml(url, fetcher, speed) {
  const res = await fetcher(url, speed);
  if (!res.ok) return "";
  return String(res.text || "");
}

async function discoverDuckDuckGo(query, fetcher, speed, pages = 1) {
  const urls = [];
  for (let index = 0; index < pages; index += 1) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${index * 30}`;
    const html = await fetchHtml(url, fetcher, speed);
    if (!html) continue;
    const $ = cheerio.load(html);
    urls.push(...$("a.result__a")
      .map((_, el) => cleanSearchResultUrl($(el).attr("href") || ""))
      .get()
      .filter(isUsefulTarget)
      .slice(0, 8));
  }
  return urls;
}

async function discoverBing(query, fetcher, speed, pages = 1) {
  const urls = [];
  for (let index = 0; index < pages; index += 1) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${1 + (index * 10)}`;
    const html = await fetchHtml(url, fetcher, speed);
    if (!html) continue;
    const $ = cheerio.load(html);
    urls.push(...$("li.b_algo h2 a")
      .map((_, el) => cleanSearchResultUrl($(el).attr("href") || ""))
      .get()
      .filter(isUsefulTarget)
      .slice(0, 8));
  }
  return urls;
}

function buildDirectTargets(keyword) {
  const q = encodeURIComponent(keyword);
  return [
    `https://github.com/search?q=${q}&type=users`,
    `https://github.com/search?q=${q}&type=repositories`,
    `https://dev.to/search?q=${q}`,
    `https://medium.com/search?q=${q}`,
    `https://www.reddit.com/search/?q=${q}`,
    `https://www.producthunt.com/search?q=${q}`,
    `https://www.yelp.com/search?find_desc=${q}`,
    `https://www.yellowpages.com/search?search_terms=${q}`,
  ];
}

export async function discoverSeedUrls(config, fetcher) {
  const keyword = await normalizeIntent(config);
  const seeds = new Set((config.seedUrls || []).map((url) => String(url || "").trim()).filter(Boolean));
  if (!keyword) return { plannedQueries: [], urls: [...seeds] };

  const normalizedConfig = { ...config, keyword };
  const plannedQueries = await planQueries(normalizedConfig);
  const discovered = new Set(buildDirectTargets(keyword));
  const pageCount = Math.max(1, Math.min(5, Math.ceil(Number(config.targetEmails || 100) / 100)));

  for (const query of plannedQueries) {
    const [ddg, bing] = await Promise.allSettled([
      discoverDuckDuckGo(query, fetcher, config.speed || "normal", pageCount),
      discoverBing(query, fetcher, config.speed || "normal", pageCount),
    ]);
    for (const result of [ddg, bing]) {
      if (result.status !== "fulfilled") continue;
      for (const url of result.value) discovered.add(url);
    }
  }

  for (const url of discovered) {
    for (const expanded of expandHighValuePaths(url)) {
      if (isUsefulTarget(expanded)) seeds.add(expanded);
    }
  }
  return { plannedQueries, urls: [...seeds].slice(0, 80) };
}
