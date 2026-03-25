import * as cheerio from "cheerio";
import { complete } from "../ai.js";

function safeKeyword(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function fallbackQueries({ keyword, industry, country, region }) {
  const base = safeKeyword([keyword, industry !== "all" ? industry : "", country !== "all" ? country : "", region !== "all" ? region : ""].filter(Boolean).join(" "));
  const stems = [
    `${base} email contact`,
    `${base} founder portfolio email`,
    `${base} agency contact`,
    `${base} github profile`,
    `${base} reddit`,
    `${base} linkedin`,
    `${base} x twitter`,
    `${base} trustpilot`,
    `${base} directory`,
    `${base} consultant`,
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

Create up to 6 search queries for discovering public profiles, portfolios, directories, agency pages, founder pages, and contact pages likely to contain email addresses.`,
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
    if (/\.(jpg|jpeg|png|gif|svg|pdf|zip)$/i.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
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
    `https://www.linkedin.com/search/results/all/?keywords=${q}`,
    `https://x.com/search?q=${q}`,
  ];
}

export async function discoverSeedUrls(config, fetcher) {
  const keyword = safeKeyword(config.keyword);
  const seeds = new Set((config.seedUrls || []).map((url) => String(url || "").trim()).filter(Boolean));
  if (!keyword) return { plannedQueries: [], urls: [...seeds] };

  const plannedQueries = await planQueries(config);
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

  for (const url of discovered) seeds.add(url);
  return { plannedQueries, urls: [...seeds].slice(0, 80) };
}
