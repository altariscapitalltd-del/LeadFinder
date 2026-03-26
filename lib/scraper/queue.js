import { ProxyAgent } from "undici";
import { getDb } from "../db.js";
import { classifyEmailType, complete } from "../ai.js";
import { discoverSeedUrls } from "./discovery.js";
import { extractLeadCandidates } from "./extract.js";
import { maybeRenderPage } from "./render.js";
import { isAllowedByRobots } from "./robots.js";
import { getValidationTag } from "./validate.js";
import {
  API_PATH_HINTS,
  BLOCKED_PATH_PARTS,
  HIGH_VALUE_PATH_HINTS,
  MAX_RETRIES,
  SPEED_DELAYS,
  USER_AGENTS,
} from "./constants.js";

let workerStarted = false;
let tickInFlight = false;
const GENERIC_ROLE_PREFIXES = ["contact", "hello", "info", "team", "sales", "partnerships"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function parseJsonSafe(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getProxies() {
  return String(process.env.SCRAPER_PROXIES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickProxy(index) {
  const proxies = getProxies();
  if (!proxies.length) return null;
  return proxies[index % proxies.length];
}

function pickUserAgent(index = 0) {
  return USER_AGENTS[index % USER_AGENTS.length];
}

function shouldSkipUrl(url) {
  const lower = String(url || "").toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return true;
  return BLOCKED_PATH_PARTS.some((part) => lower.includes(part));
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getEmailDomain(email) {
  return String(email || "").split("@")[1]?.toLowerCase() || "";
}

function isLikelyPersonalProvider(domain) {
  return ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "protonmail.com", "proton.me", "aol.com"].includes(String(domain || "").toLowerCase());
}

function isApiLikeUrl(url) {
  const lower = String(url || "").toLowerCase();
  return API_PATH_HINTS.some((hint) => lower.includes(hint));
}

function computeDelay(speed, attempt = 0) {
  const base = SPEED_DELAYS[speed] ?? SPEED_DELAYS.normal;
  return base + Math.floor(Math.random() * 220) + (attempt * 250);
}

async function fetchWithRetry(url, speed, attempt = 0, proxyIndex = 0) {
  const proxy = pickProxy(proxyIndex);
  await sleep(computeDelay(speed, attempt));
  try {
    const options = {
      headers: {
        "user-agent": pickUserAgent(attempt + proxyIndex),
        accept: "text/html,application/json,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    };
    if (proxy) options.dispatcher = new ProxyAgent(proxy);
    const response = await fetch(url, options);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      proxy,
      contentType: response.headers.get("content-type") || "",
    };
  } catch (error) {
    if (attempt >= MAX_RETRIES) throw error;
    return fetchWithRetry(url, speed, attempt + 1, proxyIndex + 1);
  }
}

async function discoveryFetch(url, speed) {
  return fetchWithRetry(url, speed || "normal");
}

function logJobEvent(db, jobId, eventType, level, message, meta = {}) {
  db.prepare(`
    INSERT INTO scrape_job_events (job_id, event_type, level, message, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(jobId, eventType, level, message, JSON.stringify(meta || {}), nowIso());
}

function getSourceBoost(db, url) {
  const domain = getDomain(url);
  if (!domain) return 0;
  const row = db.prepare("SELECT hits, inserted, failures, avg_relevance FROM scrape_source_stats WHERE domain = ?").get(domain);
  if (!row) return 0;
  const hitScore = Number(row.hits || 0) > 0 ? Number(row.inserted || 0) / Number(row.hits || 1) : 0;
  return (hitScore * 1.4) + (Number(row.avg_relevance || 0) * 0.6) - (Number(row.failures || 0) * 0.08);
}

function shouldAvoidDomain(db, url) {
  const domain = getDomain(url);
  if (!domain) return false;
  const row = db.prepare("SELECT hits, inserted, failures, avg_relevance FROM scrape_source_stats WHERE domain = ?").get(domain);
  if (!row) return false;
  return Number(row.inserted || 0) === 0 && Number(row.failures || 0) >= 4 && Number(row.avg_relevance || 0) < 0.2;
}

function updateSourceStats(db, url, delta) {
  const domain = getDomain(url);
  if (!domain) return;
  const existing = db.prepare("SELECT * FROM scrape_source_stats WHERE domain = ?").get(domain);
  if (!existing) {
    db.prepare(`
      INSERT INTO scrape_source_stats (domain, hits, inserted, duplicates, failures, avg_relevance, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      domain,
      delta.hits || 0,
      delta.inserted || 0,
      delta.duplicates || 0,
      delta.failures || 0,
      Number(delta.relevance || 0),
      nowIso()
    );
    return;
  }
  const nextHits = Number(existing.hits || 0) + Number(delta.hits || 0);
  const nextInserted = Number(existing.inserted || 0) + Number(delta.inserted || 0);
  const nextDuplicates = Number(existing.duplicates || 0) + Number(delta.duplicates || 0);
  const nextFailures = Number(existing.failures || 0) + Number(delta.failures || 0);
  const priorWeight = Math.max(1, Number(existing.hits || 0));
  const nextAvgRelevance = ((Number(existing.avg_relevance || 0) * priorWeight) + Number(delta.relevance || 0)) / (priorWeight + 1);
  db.prepare(`
    UPDATE scrape_source_stats
    SET hits = ?, inserted = ?, duplicates = ?, failures = ?, avg_relevance = ?, updated_at = ?
    WHERE domain = ?
  `).run(nextHits, nextInserted, nextDuplicates, nextFailures, nextAvgRelevance, nowIso(), domain);
}

function scoreUrlForCrawl(db, url, config, parentUrl = "") {
  let score = 0.35 + getSourceBoost(db, url);
  const lower = String(url || "").toLowerCase();
  const keyword = String(config.keyword || "").toLowerCase();
  const industry = String(config.industry || "").toLowerCase();
  const country = String(config.country || "").toLowerCase();

  if (keyword && lower.includes(keyword.replace(/\s+/g, "-"))) score += 0.45;
  if (keyword && lower.includes(keyword.replace(/\s+/g, ""))) score += 0.3;
  if (industry && industry !== "all" && lower.includes(industry.replace(/\s+/g, "-"))) score += 0.2;
  if (country && country !== "all" && lower.includes(country.toLowerCase().replace(/\s+/g, "-"))) score += 0.15;
  if (HIGH_VALUE_PATH_HINTS.some((hint) => lower.includes(hint))) score += 0.75;
  if (isApiLikeUrl(url)) score += 0.55;
  if (parentUrl && getDomain(parentUrl) === getDomain(url)) score += 0.1;
  if (/tag|category|topic|directory|member|profile|author|company|startup|blog/i.test(lower)) score += 0.18;
  if (/\.(jpg|jpeg|png|gif|svg|pdf|zip|webp)$/i.test(lower)) score -= 2;
  return Number(score.toFixed(4));
}

function classifyPageHeuristically(url, text, config) {
  const haystack = `${url}\n${text}`.toLowerCase();
  const keyword = String(config.keyword || "").toLowerCase();
  let relevance = 0.2;
  if (keyword && haystack.includes(keyword)) relevance += 0.45;
  if (config.industry && config.industry !== "all" && haystack.includes(String(config.industry).toLowerCase())) relevance += 0.2;
  if (config.country && config.country !== "all" && haystack.includes(String(config.country).toLowerCase())) relevance += 0.1;
  if (/contact|about|team|company|founder|startup|directory|profile|community/.test(haystack)) relevance += 0.18;
  if (/privacy|terms|cookie|checkout|cart|policy/.test(haystack)) relevance -= 0.3;
  return Math.max(0, Math.min(1, relevance));
}

async function maybeAiClassifyPage(url, text, config) {
  if (!config.keyword) {
    const relevance = classifyPageHeuristically(url, text, config);
    return { relevance, reason: "heuristic" };
  }
  try {
    const raw = await complete({
      system: "Classify page relevance for lead discovery. Return only JSON: {\"relevance\": number, \"reason\": \"short string\"}. relevance must be between 0 and 1.",
      prompt: `Target keyword: ${config.keyword}
Industry: ${config.industry}
Country: ${config.country}
URL: ${url}
Page excerpt: ${String(text || "").slice(0, 3500)}`,
      taskType: "analysis",
      maxTokens: 120,
    });
    const parsed = parseJsonSafe(String(raw || "").replace(/```json|```/g, "").trim(), null);
    if (parsed && typeof parsed.relevance === "number") {
      return {
        relevance: Math.max(0, Math.min(1, parsed.relevance)),
        reason: parsed.reason || "ai",
      };
    }
  } catch {}
  const relevance = classifyPageHeuristically(url, text, config);
  return { relevance, reason: "heuristic-fallback" };
}

function extractLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl).toString();
      if (seen.has(url)) continue;
      seen.add(url);
      links.push(url);
    } catch {}
  }
  return links;
}

function discoverApiTargets(html, baseUrl) {
  const found = new Set();
  const patterns = [
    /https?:\/\/[^\s"'<>]+/gi,
    /["'](\/api\/[^"']+)["']/gi,
    /["'](\/wp-json\/[^"']+)["']/gi,
    /["']([^"']+\.json(?:\?[^"']*)?)["']/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const candidate = match[1] || match[0];
      try {
        const url = new URL(candidate, baseUrl).toString();
        if (isApiLikeUrl(url)) found.add(url);
      } catch {}
    }
  }
  return [...found];
}

function buildFollowupPaths(url) {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    return [
      { url: origin, kind: "page" },
      { url: `${origin}/contact`, kind: "contact" },
      { url: `${origin}/contact-us`, kind: "contact" },
      { url: `${origin}/about`, kind: "page" },
      { url: `${origin}/about-us`, kind: "page" },
      { url: `${origin}/team`, kind: "page" },
      { url: `${origin}/privacy`, kind: "page" },
    ];
  } catch {
    return [];
  }
}

async function upsertLead(db, lead, config) {
  const email = lead.email.toLowerCase();
  const validation = await getValidationTag(email);
  const type = classifyEmailType(email);
  const classificationConfidence = type === "business" ? 0.92 : 0.96;
  const tagSet = new Set([`validation:${validation}`]);
  if (lead.profession) tagSet.add(`profession:${lead.profession.toLowerCase()}`);
  if (config?.industry && config.industry !== "all") tagSet.add(`industry:${String(config.industry).toLowerCase()}`);
  if (config?.region && config.region !== "all") tagSet.add(`region:${String(config.region).toLowerCase()}`);
  if (config?.keyword) tagSet.add(`keyword:${String(config.keyword).toLowerCase()}`);

  const existing = db.prepare("SELECT id, tags FROM contacts WHERE email = ?").get(email);
  const score = Math.max(1, Math.min(100, Math.round(lead.score || 50)));
  const sourceLabel = `Scraped: ${getDomain(lead.source_url)}`;

  if (!existing) {
    db.prepare(`
      INSERT INTO contacts (email, name, country, region, type, source, tags, score, status, consent_note, scrape_job_id, source_url, classification_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
    `).run(
      email,
      lead.name || null,
      lead.country || (config?.country !== "all" ? config.country : null),
      config?.region !== "all" ? config.region : null,
      type,
      sourceLabel,
      JSON.stringify([...tagSet]),
      score,
      `Publicly discovered from ${lead.source_url}`,
      Number(config.jobId || 0) || null,
      lead.source_url,
      classificationConfidence
    );
    return { inserted: 1, duplicate: 0, type, classificationConfidence };
  }

  const mergedTags = new Set([...(parseJsonSafe(existing.tags, [])), ...tagSet]);
  db.prepare(`
    UPDATE contacts
    SET name = COALESCE(?, name),
        country = COALESCE(?, country),
        region = COALESCE(?, region),
        source = ?,
        score = MAX(score, ?),
        tags = ?,
        scrape_job_id = COALESCE(?, scrape_job_id),
        source_url = COALESCE(?, source_url),
        classification_confidence = MAX(classification_confidence, ?),
        updated_at = ?
    WHERE id = ?
  `).run(
    lead.name || null,
    lead.country || (config?.country !== "all" ? config.country : null),
    config?.region !== "all" ? config.region : null,
    sourceLabel,
    score,
    JSON.stringify([...mergedTags]),
    Number(config.jobId || 0) || null,
    lead.source_url,
    classificationConfidence,
    nowIso(),
    existing.id
  );
  return { inserted: 0, duplicate: 1, type, classificationConfidence };
}

async function generateCandidateEmails(db, pageUrl, extractedLeads, config) {
  if (!config.generateEmails || config.generationMode === "off") return [];

  const domainCandidates = new Set();
  const pageDomain = getDomain(pageUrl);
  if (pageDomain && !isLikelyPersonalProvider(pageDomain)) domainCandidates.add(pageDomain);
  for (const lead of extractedLeads) {
    const domain = getEmailDomain(lead.email);
    if (domain && !isLikelyPersonalProvider(domain)) domainCandidates.add(domain);
  }

  const generated = [];
  for (const domain of domainCandidates) {
    for (const prefix of GENERIC_ROLE_PREFIXES) {
      generated.push({
        email: `${prefix}@${domain}`,
        source_url: pageUrl,
        source: `Generated from ${domain}`,
        name: null,
        score: 28,
      });
    }
  }
  return generated;
}

function emailMatchesFilter(email, type, filterMode) {
  const lower = String(email || "").toLowerCase();
  if (filterMode === "gmail_only") return lower.endsWith("@gmail.com");
  if (filterMode === "personal") return type === "personal";
  if (filterMode === "business") return type === "business";
  return true;
}

function upsertSuggestion(db, kind, value, confidence = 65) {
  if (!value) return;
  db.prepare(`
    INSERT INTO scrape_suggestions (kind, value, confidence, created_at)
    VALUES (?, ?, ?, ?)
  `).run(kind, value, confidence, nowIso());
}

function queueLink(db, jobId, url, depth, config, parentUrl, pageKind = "page", priorityBias = 0) {
  if (shouldSkipUrl(url)) return;
  if (shouldAvoidDomain(db, url)) return;
  const priority = scoreUrlForCrawl(db, url, config, parentUrl) + Number(priorityBias || 0);
  const result = db.prepare(`
    INSERT OR IGNORE INTO scrape_pages (job_id, url, depth, status, priority, parent_url, page_kind, created_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)
  `).run(jobId, url, depth, priority, parentUrl || null, pageKind, nowIso());
  return Number(result.changes || 0) > 0;
}

function getQueueCounts(db, jobId) {
  return db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
    FROM scrape_pages
    WHERE job_id = ?
  `).get(jobId);
}

async function processPage(db, jobId, pageRow, config, counters) {
  const url = pageRow.url;
  const userAgent = pickUserAgent((pageRow.retry_count || 0) + (pageRow.id || 0));

  if (shouldSkipUrl(url)) {
    db.prepare("UPDATE scrape_pages SET status='skipped', note=? WHERE id=?").run("blocked path", pageRow.id);
    counters.skipped += 1;
    logJobEvent(db, jobId, "progress_update", "debug", "Skipped blocked path", { url });
    return [];
  }

  const allowed = await isAllowedByRobots(url, userAgent, (robotsUrl) => fetchWithRetry(robotsUrl, config.speed || "normal"));
  if (!allowed) {
    db.prepare("UPDATE scrape_pages SET status='skipped', note=? WHERE id=?").run("blocked by robots.txt", pageRow.id);
    counters.skipped += 1;
    updateSourceStats(db, url, { hits: 1, failures: 1, relevance: 0 });
    logJobEvent(db, jobId, "progress_update", "warn", "Robots blocked URL", { url });
    return [];
  }

  try {
    const response = await fetchWithRetry(url, config.speed || "normal", 0, pageRow.retry_count || 0);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let body = response.text || "";
    const rendered = await maybeRenderPage(url, body);
    body = rendered.html || body;
    if (rendered.rendered) {
      logJobEvent(db, jobId, "progress_update", "info", "Rendered JS-heavy page", { url, renderer: rendered.reason });
    }
    if (/captcha|cloudflare|recaptcha|hcaptcha/i.test(body)) {
      db.prepare("UPDATE scrape_pages SET status='skipped', note=? WHERE id=?").run("captcha detected", pageRow.id);
      counters.captcha += 1;
      updateSourceStats(db, url, { hits: 1, failures: 1, relevance: 0.1 });
      logJobEvent(db, jobId, "progress_update", "warn", "Captcha or challenge page detected", { url });
      return [];
    }

    const pageText = String(body).slice(0, 12000);
    const classification = await maybeAiClassifyPage(url, pageText, config);
    const leads = extractLeadCandidates(body, url);
    const generatedLeads = await generateCandidateEmails(db, url, leads, config);
    const combinedLeads = [...leads, ...generatedLeads];

    let inserted = 0;
    let duplicates = 0;
    let filteredOut = 0;
    let generatedCount = 0;
    for (const lead of combinedLeads) {
      const provisionalType = classifyEmailType(lead.email.toLowerCase());
      if (!emailMatchesFilter(lead.email, provisionalType, config.emailFilter || "all")) {
        filteredOut += 1;
        continue;
      }
      const validation = await getValidationTag(lead.email.toLowerCase());
      if (validation !== "valid") {
        filteredOut += 1;
        continue;
      }
      const result = await upsertLead(db, lead, config);
      inserted += result.inserted;
      duplicates += result.duplicate;
      if (lead.source?.startsWith("Generated from ")) generatedCount += result.inserted;
      if (lead.profession) upsertSuggestion(db, "industry", lead.profession, 70);
      if (lead.country) upsertSuggestion(db, "country", lead.country, 65);
      upsertSuggestion(db, "source", getDomain(url), 60);
      logJobEvent(db, jobId, lead.source?.startsWith("Generated from ") ? "email_generated" : "email_found", "info", `${lead.source?.startsWith("Generated from ") ? "Generated" : "Found"} ${result.type} email ${lead.email}`, {
        email: lead.email,
        sourceUrl: lead.source_url,
        confidence: result.classificationConfidence,
      });
    }

    counters.inserted += inserted;
    counters.duplicates += duplicates;
    counters.filteredOut += filteredOut;
    counters.pagesDone += 1;
    updateSourceStats(db, url, {
      hits: 1,
      inserted,
      duplicates,
      failures: 0,
      relevance: classification.relevance,
    });

    counters.generated = Number(counters.generated || 0) + generatedCount;
    const note = `emails:${combinedLeads.length};accepted:${inserted};generated:${generatedCount};filtered:${filteredOut};relevance:${classification.relevance.toFixed(2)}`;
    db.prepare("UPDATE scrape_pages SET status='done', note=? WHERE id=?").run(note, pageRow.id);
    logJobEvent(db, jobId, "progress_update", "info", "Processed page", {
      url,
      inserted,
      duplicates,
      filteredOut,
      generated: generatedCount,
      relevance: classification.relevance,
      reason: classification.reason,
    });
    if (filteredOut > 0) {
      logJobEvent(db, jobId, "filter_applied", "info", `Filtered ${filteredOut} emails using ${config.emailFilter || "all"} rule`, {
        url,
        filter: config.emailFilter || "all",
      });
    }

    const depth = Number(pageRow.depth || 0);
    const maxDepth = config.depthLevel === "deep" ? 4 : config.depthLevel === "medium" ? 2 : 1;
    if (depth >= maxDepth || classification.relevance < 0.12) return [];

    const links = extractLinks(body, url)
      .map((link) => ({
        url: link,
        kind: isApiLikeUrl(link) ? "api" : HIGH_VALUE_PATH_HINTS.some((hint) => link.toLowerCase().includes(hint)) ? "contact" : "page",
      }));
    const apiLinks = discoverApiTargets(body, url).map((link) => ({ url: link, kind: "api" }));
    const followupPaths = buildFollowupPaths(url);
    const combined = [...links, ...apiLinks, ...followupPaths];
    combined.sort((a, b) => scoreUrlForCrawl(db, b.url, config, url) - scoreUrlForCrawl(db, a.url, config, url));
    const selected = combined.slice(0, classification.relevance >= 0.5 ? 45 : 20);
    if (selected.length) {
      logJobEvent(db, jobId, "crawl_expansion", "info", `Expanded crawl frontier by ${selected.length} links`, {
        url,
        next: selected.slice(0, 5),
      });
    }
    return selected;
  } catch (error) {
    const retries = Number(pageRow.retry_count || 0) + 1;
    if (retries <= MAX_RETRIES) {
      db.prepare("UPDATE scrape_pages SET retry_count=?, status='queued', note=? WHERE id=?").run(retries, String(error.message || "retry").slice(0, 180), pageRow.id);
    } else {
      db.prepare("UPDATE scrape_pages SET status='failed', note=? WHERE id=?").run(String(error.message || "failed").slice(0, 180), pageRow.id);
      counters.failed += 1;
      updateSourceStats(db, url, { hits: 1, failures: 1, relevance: 0 });
    }
    logJobEvent(db, jobId, "progress_update", "error", "Page processing failed", { url, error: error.message, retries });
    return [];
  }
}

async function buildScrapeSummary(config, counters, queueCounts) {
  const fallback = `Discovery finished for "${config.keyword || "seed crawl"}". Scanned ${counters.pagesDone + counters.failed + counters.skipped} pages, inserted ${counters.inserted} unique emails, generated ${counters.generated || 0} validated email candidates, and left ${queueCounts.queued || 0} queued pages after exhausting the current frontier.`;
  try {
    return await complete({
      system: "You summarize web lead discovery results for an operator dashboard. Mention what happened, the likely best source pattern, and what to try next. Return plain text only.",
      prompt: `Job config: ${JSON.stringify(config)}
Counters: ${JSON.stringify(counters)}
Queue counts: ${JSON.stringify(queueCounts)}
Write a concise 2-3 sentence summary.`,
      taskType: "analysis",
      maxTokens: 220,
    });
  } catch {
    return fallback;
  }
}

function computeJobLimits(config) {
  const targetEmails = Math.max(10, Math.min(5000, Number(config.targetEmails || 100)));
  const requestedPageBudget = Math.max(1, Math.min(5000, Number(config.maxPages || 150)));
  const hardMaxPages = Math.max(requestedPageBudget * 8, targetEmails * 25, 1500);
  return { targetEmails, requestedPageBudget, hardMaxPages };
}

function buildProgressPayload(base, discovered, queueCounts, currentTask = "Discovering...") {
  return {
    ...base,
    queries: discovered.plannedQueries || base.queries || [],
    discoveredSeeds: Number(discovered.seedCount ?? base.discoveredSeeds ?? 0),
    replenishRound: Number(base.replenishRound || 0),
    queue: queueCounts,
    currentTask,
    updatedAt: nowIso(),
  };
}

async function initializeJob(db, job, initialConfig = null) {
  const config = initialConfig ? { ...initialConfig } : parseJsonSafe(job.config_json, {});
  config.jobId = job.id;
  const counters = {
    pagesDone: 0,
    inserted: 0,
    duplicates: 0,
    filteredOut: 0,
    skipped: 0,
    failed: 0,
    captcha: 0,
    generated: 0,
  };

  db.prepare("UPDATE scrape_jobs SET status='running', started_at=?, error_msg=NULL WHERE id=?").run(nowIso(), job.id);
  logJobEvent(db, job.id, "progress_update", "info", "Discovery job started", {
    keyword: config.keyword,
    targetEmails: config.targetEmails,
    emailFilter: config.emailFilter || "all",
  });

  const discovered = await discoverSeedUrls({ ...config, discoveryRound: 0 }, discoveryFetch);
  const seeds = Array.isArray(discovered.urls) ? discovered.urls : [];
  const explicitSeeds = Array.isArray(config.seedUrls) ? config.seedUrls.map((url) => String(url || "").trim()).filter(Boolean) : [];
  logJobEvent(db, job.id, "crawl_expansion", "info", "Expanded discovery sources", {
    plannedQueries: discovered.plannedQueries || [],
    seedCount: seeds.length,
  });

  for (const seed of explicitSeeds) {
    queueLink(db, job.id, seed, 0, config, null, isApiLikeUrl(seed) ? "api" : "manual_seed", 2.5);
  }

  for (const seed of seeds) {
    if (explicitSeeds.includes(seed)) continue;
    queueLink(db, job.id, seed, 0, config, null, isApiLikeUrl(seed) ? "api" : "seed");
  }

  const { targetEmails, requestedPageBudget, hardMaxPages } = computeJobLimits(config);
  const queueCounts = getQueueCounts(db, job.id);
  const initialProgress = buildProgressPayload({
    ...counters,
    scanned: 0,
    maxPages: requestedPageBudget,
    hardMaxPages,
    targetEmails,
    replenishRound: 0,
  }, { plannedQueries: discovered.plannedQueries || [], seedCount: seeds.length }, queueCounts);
  db.prepare("UPDATE scrape_jobs SET progress_json=? WHERE id=?").run(JSON.stringify(initialProgress), job.id);
  return {
    config,
    discovered: { plannedQueries: discovered.plannedQueries || [], seedCount: seeds.length },
    counters,
    visited: 0,
    replenishRound: 0,
    targetEmails,
    requestedPageBudget,
    hardMaxPages,
  };
}

async function processRunningJobSlice(db, job, state, pageBudget = 4) {
  const { config, discovered } = state;
  let { counters, visited, replenishRound, targetEmails, requestedPageBudget, hardMaxPages } = state;
  let frontierExhausted = false;
  let processed = 0;

  while (processed < pageBudget && visited < hardMaxPages && counters.inserted < targetEmails) {
    const latest = db.prepare("SELECT status FROM scrape_jobs WHERE id = ?").get(job.id);
    if (!latest || latest.status === "cancelled") {
      logJobEvent(db, job.id, "task_complete", "warn", "Discovery job cancelled", {});
      return { done: true, cancelled: true };
    }

    const pageRow = db.prepare(`
      SELECT *
      FROM scrape_pages
      WHERE job_id = ? AND status = 'queued'
      ORDER BY priority DESC, depth ASC, id ASC
      LIMIT 1
    `).get(job.id);
    if (!pageRow) {
      if (replenishRound < 4) {
        replenishRound += 1;
        const extra = await discoverSeedUrls({ ...config, discoveryRound: replenishRound, targetEmails: Math.max(25, targetEmails - counters.inserted) }, discoveryFetch);
        let added = 0;
        for (const seed of extra.urls || []) {
          if (queueLink(db, job.id, seed, 0, config, null, "rediscovered", 0.4)) added += 1;
        }
        logJobEvent(db, job.id, "crawl_expansion", "info", `Replenished crawl frontier with round ${replenishRound}`, {
          added,
          plannedQueries: extra.plannedQueries || [],
        });
        const queueCounts = getQueueCounts(db, job.id);
        const progress = buildProgressPayload({
          ...counters,
          scanned: visited,
          maxPages: requestedPageBudget,
          hardMaxPages,
          targetEmails,
          replenishRound,
        }, discovered, queueCounts, "Researching new source paths...");
        db.prepare("UPDATE scrape_jobs SET progress_json=? WHERE id=?").run(JSON.stringify(progress), job.id);
        if (added > 0) continue;
      }
      frontierExhausted = true;
      break;
    }

    visited += 1;
    processed += 1;
    const nextTargets = await processPage(db, job.id, pageRow, config, counters);
    for (const target of nextTargets) {
      queueLink(db, job.id, target.url, Number(pageRow.depth || 0) + 1, config, pageRow.url, target.kind);
    }

    const queueCounts = getQueueCounts(db, job.id);
    if (Number(queueCounts.queued || 0) < 8 && counters.inserted < targetEmails && replenishRound < 4) {
      replenishRound += 1;
      const extra = await discoverSeedUrls({ ...config, discoveryRound: replenishRound, targetEmails: Math.max(25, targetEmails - counters.inserted) }, discoveryFetch);
      let added = 0;
      for (const seed of extra.urls || []) {
        if (queueLink(db, job.id, seed, 0, config, null, "rediscovered", 0.25)) added += 1;
      }
      if (added > 0) {
        logJobEvent(db, job.id, "crawl_expansion", "info", `Expanded search breadth with round ${replenishRound}`, {
          added,
          plannedQueries: extra.plannedQueries || [],
        });
      }
    }
    const progress = buildProgressPayload({
      ...counters,
      scanned: visited,
      maxPages: requestedPageBudget,
      hardMaxPages,
      targetEmails,
      replenishRound,
    }, discovered, queueCounts, `Scanning ${getDomain(pageRow.url) || "target"}...`);
    db.prepare("UPDATE scrape_jobs SET progress_json=? WHERE id=?").run(JSON.stringify(progress), job.id);
  }

  const queueCounts = getQueueCounts(db, job.id);
  const shouldComplete = counters.inserted >= targetEmails || visited >= hardMaxPages || frontierExhausted || Number(queueCounts.queued || 0) === 0;
  if (!shouldComplete) {
    const progress = buildProgressPayload({
      ...counters,
      scanned: visited,
      maxPages: requestedPageBudget,
      hardMaxPages,
      targetEmails,
      replenishRound,
    }, discovered, queueCounts, "Discovering...");
    db.prepare("UPDATE scrape_jobs SET status='running', progress_json=? WHERE id=?").run(JSON.stringify(progress), job.id);
    return { done: false };
  }

  const summary = await buildScrapeSummary(config, counters, queueCounts);
  logJobEvent(db, job.id, "task_complete", "info", "Discovery job finished", {
    scanned: visited,
    inserted: counters.inserted,
    queueCounts,
  });

  db.prepare(`
    UPDATE scrape_jobs
    SET status='completed', progress_json=?, finished_at=?
    WHERE id=?
  `).run(
    JSON.stringify({
      ...buildProgressPayload({
        ...counters,
        scanned: visited,
        maxPages: requestedPageBudget,
        hardMaxPages,
        targetEmails,
        replenishRound,
      }, discovered, queueCounts, frontierExhausted && counters.inserted < targetEmails ? "Frontier exhausted" : "Completed"),
      summary,
    }),
    nowIso(),
    job.id
  );
  return { done: true };
}

export async function processScrapeJobSlice(jobId, pageBudget = 4) {
  const db = getDb();
  const job = db.prepare("SELECT * FROM scrape_jobs WHERE id = ?").get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return getScrapeJob(jobId);
  }

  if (job.status === "queued") {
    const initialized = await initializeJob(db, job, parseJsonSafe(job.config_json, {}));
    await processRunningJobSlice(db, { ...job, status: "running" }, initialized, pageBudget);
    return getScrapeJob(jobId);
  }

  const config = parseJsonSafe(job.config_json, {});
  config.jobId = job.id;
  const progress = parseJsonSafe(job.progress_json, {});
  const discovered = {
    plannedQueries: progress.queries || [],
    seedCount: progress.discoveredSeeds || 0,
  };
  await processRunningJobSlice(db, job, {
    config,
    discovered,
    counters: {
      pagesDone: Number(progress.pagesDone || 0),
      inserted: Number(progress.inserted || 0),
      duplicates: Number(progress.duplicates || 0),
      filteredOut: Number(progress.filteredOut || 0),
      skipped: Number(progress.skipped || 0),
      failed: Number(progress.failed || 0),
      captcha: Number(progress.captcha || 0),
      generated: Number(progress.generated || 0),
    },
    visited: Number(progress.scanned || 0),
    replenishRound: Number(progress.replenishRound || 0),
    ...computeJobLimits(config),
  }, pageBudget);
  return getScrapeJob(jobId);
}

async function runJob(db, job) {
  while (true) {
    const current = db.prepare("SELECT status FROM scrape_jobs WHERE id = ?").get(job.id);
    if (!current || ["completed", "failed", "cancelled"].includes(current.status)) break;
    await processScrapeJobSlice(job.id, 4);
    const after = db.prepare("SELECT status FROM scrape_jobs WHERE id = ?").get(job.id);
    if (!after || ["completed", "failed", "cancelled"].includes(after.status)) break;
  }
}

async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const db = getDb();
    const next = db.prepare(`
      SELECT *
      FROM scrape_jobs
      WHERE status = 'queued'
      ORDER BY id ASC
      LIMIT 1
    `).get();
    if (!next) return;
    await runJob(db, next);
  } finally {
    tickInFlight = false;
  }
}

export function startScrapeWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const timer = setInterval(() => {
    tick().catch(() => {});
  }, 1200);
  if (typeof timer.unref === "function") timer.unref();
}

export function enqueueScrapeJob(config) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO scrape_jobs (status, config_json, progress_json, created_at)
    VALUES ('queued', ?, '{}', ?)
  `).run(JSON.stringify(config), nowIso());
  return Number(result.lastInsertRowid);
}

export function listScrapeJobs(limit = 30) {
  const db = getDb();
  return db.prepare("SELECT * FROM scrape_jobs ORDER BY id DESC LIMIT ?").all(limit).map((job) => ({
    ...job,
    config: parseJsonSafe(job.config_json, {}),
    progress: parseJsonSafe(job.progress_json, {}),
  }));
}

export function getScrapeJob(id) {
  const db = getDb();
  const job = db.prepare("SELECT * FROM scrape_jobs WHERE id = ?").get(id);
  if (!job) return null;
  const pages = db.prepare(`
    SELECT id, url, depth, status, retry_count, note, priority, parent_url, page_kind, created_at
    FROM scrape_pages
    WHERE job_id = ?
    ORDER BY priority DESC, id DESC
    LIMIT 160
  `).all(id);
  const events = db.prepare(`
    SELECT id, event_type, level, message, meta_json, created_at
    FROM scrape_job_events
    WHERE job_id = ?
    ORDER BY id DESC
    LIMIT 80
  `).all(id).map((event) => ({
    ...event,
    meta: parseJsonSafe(event.meta_json, {}),
  }));
  return {
    ...job,
    config: parseJsonSafe(job.config_json, {}),
    progress: parseJsonSafe(job.progress_json, {}),
    pages,
    events,
  };
}

export function cancelScrapeJob(id) {
  const db = getDb();
  db.prepare("UPDATE scrape_jobs SET status='cancelled', finished_at=? WHERE id=? AND status IN ('queued','running')")
    .run(nowIso(), id);
  logJobEvent(db, id, "task_complete", "warn", "Cancellation requested", {});
}
