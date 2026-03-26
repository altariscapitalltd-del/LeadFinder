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
  const priority = scoreUrlForCrawl(db, url, config, parentUrl) + Number(priorityBias || 0);
  db.prepare(`
    INSERT OR IGNORE INTO scrape_pages (job_id, url, depth, status, priority, parent_url, page_kind, created_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)
  `).run(jobId, url, depth, priority, parentUrl || null, pageKind, nowIso());
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

    let inserted = 0;
    let duplicates = 0;
    let filteredOut = 0;
    for (const lead of leads) {
      const provisionalType = classifyEmailType(lead.email.toLowerCase());
      if (!emailMatchesFilter(lead.email, provisionalType, config.emailFilter || "all")) {
        filteredOut += 1;
        continue;
      }
      const result = await upsertLead(db, lead, config);
      inserted += result.inserted;
      duplicates += result.duplicate;
      if (lead.profession) upsertSuggestion(db, "industry", lead.profession, 70);
      if (lead.country) upsertSuggestion(db, "country", lead.country, 65);
      upsertSuggestion(db, "source", getDomain(url), 60);
      logJobEvent(db, jobId, "email_found", "info", `Found ${result.type} email ${lead.email}`, {
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

    const note = `emails:${leads.length};accepted:${inserted};filtered:${filteredOut};relevance:${classification.relevance.toFixed(2)}`;
    db.prepare("UPDATE scrape_pages SET status='done', note=? WHERE id=?").run(note, pageRow.id);
    logJobEvent(db, jobId, "progress_update", "info", "Processed page", {
      url,
      inserted,
      duplicates,
      filteredOut,
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
  const fallback = `Discovery finished for "${config.keyword || "seed crawl"}". Scanned ${counters.pagesDone + counters.failed + counters.skipped} pages, inserted ${counters.inserted} unique emails, and left ${queueCounts.queued || 0} low-priority pages unvisited after hitting the current stop condition.`;
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

async function runJob(db, job) {
  const config = parseJsonSafe(job.config_json, {});
  config.jobId = job.id;
  const counters = {
    pagesDone: 0,
    inserted: 0,
    duplicates: 0,
    filteredOut: 0,
    skipped: 0,
    failed: 0,
    captcha: 0,
  };

  db.prepare("UPDATE scrape_jobs SET status='running', started_at=?, error_msg=NULL WHERE id=?").run(nowIso(), job.id);
  logJobEvent(db, job.id, "progress_update", "info", "Discovery job started", {
    keyword: config.keyword,
    targetEmails: config.targetEmails,
    emailFilter: config.emailFilter || "all",
  });

  const discovered = await discoverSeedUrls(config, discoveryFetch);
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

  const targetEmails = Math.max(10, Math.min(5000, Number(config.targetEmails || 100)));
  const maxPages = Math.max(targetEmails * 3, Math.max(1, Math.min(5000, Number(config.maxPages || 150))));
  let visited = 0;

  while (visited < maxPages && counters.inserted < targetEmails) {
    const latest = db.prepare("SELECT status FROM scrape_jobs WHERE id = ?").get(job.id);
    if (!latest || latest.status === "cancelled") {
      logJobEvent(db, job.id, "task_complete", "warn", "Discovery job cancelled", {});
      return;
    }

    const pageRow = db.prepare(`
      SELECT *
      FROM scrape_pages
      WHERE job_id = ? AND status = 'queued'
      ORDER BY priority DESC, depth ASC, id ASC
      LIMIT 1
    `).get(job.id);
    if (!pageRow) break;

    visited += 1;
    const nextTargets = await processPage(db, job.id, pageRow, config, counters);
    for (const target of nextTargets) {
      queueLink(db, job.id, target.url, Number(pageRow.depth || 0) + 1, config, pageRow.url, target.kind);
    }

    const queueCounts = getQueueCounts(db, job.id);
    const progress = {
      ...counters,
      scanned: visited,
      maxPages,
      targetEmails,
      queries: discovered.plannedQueries || [],
      discoveredSeeds: seeds.length,
      queue: queueCounts,
      currentTask: `Scanning ${getDomain(pageRow.url) || "target"}...`,
      updatedAt: nowIso(),
    };
    db.prepare("UPDATE scrape_jobs SET progress_json=? WHERE id=?").run(JSON.stringify(progress), job.id);
  }

  const queueCounts = getQueueCounts(db, job.id);
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
      ...counters,
      scanned: visited,
      maxPages,
      targetEmails,
      queries: discovered.plannedQueries || [],
      discoveredSeeds: seeds.length,
      queue: queueCounts,
      summary,
      currentTask: "Completed",
      updatedAt: nowIso(),
    }),
    nowIso(),
    job.id
  );
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
