import { getDb } from "../db.js";
import { classifyEmailType } from "../ai.js";
import { extractLeadCandidates } from "./extract.js";
import { isAllowedByRobots } from "./robots.js";
import { getValidationTag } from "./validate.js";
import { BLOCKED_PATH_PARTS, MAX_RETRIES, SPEED_DELAYS } from "./constants.js";
import { ProxyAgent } from "undici";

const USER_AGENT = "LeadForgeBot/1.0 (+https://leadforge.local)";
let workerStarted = false;
let tickInFlight = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const raw = process.env.SCRAPER_PROXIES || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function pickProxy(index) {
  const proxies = getProxies();
  if (!proxies.length) return null;
  return proxies[index % proxies.length];
}

function shouldSkipUrl(url) {
  const lower = url.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return true;
  return BLOCKED_PATH_PARTS.some((p) => lower.includes(p));
}

async function fetchWithRetry(url, speed, attempt = 0, proxyIndex = 0) {
  const proxy = pickProxy(proxyIndex);
  const delay = SPEED_DELAYS[speed] ?? SPEED_DELAYS.normal;
  await sleep(delay);
  try {
    const opts = {
      headers: {
        "user-agent": USER_AGENT,
      },
    };
    if (proxy) opts.dispatcher = new ProxyAgent(proxy);
    const res = await fetch(url, opts);
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, proxy };
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    await sleep(300 * (attempt + 1));
    return fetchWithRetry(url, speed, attempt + 1, proxyIndex + 1);
  }
}

function extractLinks(html, baseUrl) {
  const urls = new Set();
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html))) {
    const href = match[1];
    try {
      const full = new URL(href, baseUrl).toString();
      urls.add(full);
    } catch {}
  }
  return [...urls];
}

async function upsertLead(db, lead, config) {
  const email = lead.email.toLowerCase();
  const validation = await getValidationTag(email);
  const type = classifyEmailType(email);
  const tagSet = new Set([`validation:${validation}`]);
  if (lead.profession) tagSet.add(`profession:${lead.profession.toLowerCase()}`);
  if (config?.industry) tagSet.add(`industry:${String(config.industry).toLowerCase()}`);
  if (config?.region) tagSet.add(`region:${String(config.region).toLowerCase()}`);

  const existing = db.prepare("SELECT id, name, source, score, tags FROM contacts WHERE email = ?").get(email);
  const domain = email.split("@")[1] || "";
  const possibleDuplicate = lead.name
    ? db.prepare(`
        SELECT id, email FROM contacts
        WHERE LOWER(name) = LOWER(?)
          AND email LIKE ?
          AND email != ?
        LIMIT 1
      `).get(lead.name, `%@${domain}`, email)
    : null;
  if (possibleDuplicate) tagSet.add("possible_duplicate");
  const score = Math.max(1, Math.min(100, Math.round(lead.score || 50)));
  const sourceLabel = `Scraped: ${new URL(lead.source_url).hostname}`;

  if (!existing) {
    db.prepare(`
      INSERT INTO contacts (email, name, country, region, type, source, tags, score, status, consent_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
    `).run(
      email,
      lead.name || null,
      lead.country || config?.country || null,
      config?.region || null,
      type,
      sourceLabel,
      JSON.stringify([...tagSet]),
      score,
      `Publicly discovered from ${lead.source_url}`
    );
    return { inserted: 1, duplicate: 0 };
  }

  // Preserve newest enrichment while keeping dedupe strict by email.
  const mergedTags = new Set([...(parseJsonSafe(existing.tags, [])), ...tagSet]);
  db.prepare(`
    UPDATE contacts SET
      name = COALESCE(?, name),
      country = COALESCE(?, country),
      region = COALESCE(?, region),
      source = ?,
      score = MAX(score, ?),
      tags = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    lead.name || null,
    lead.country || config?.country || null,
    config?.region || null,
    sourceLabel,
    score,
    JSON.stringify([...mergedTags]),
    nowIso(),
    existing.id
  );
  return { inserted: 0, duplicate: 1 };
}

function upsertSuggestion(db, kind, value, confidence = 65) {
  if (!value) return;
  db.prepare(`
    INSERT INTO scrape_suggestions (kind, value, confidence, created_at)
    VALUES (?, ?, ?, ?)
  `).run(kind, value, confidence, nowIso());
}

async function processPage(db, jobId, pageRow, config, counters) {
  const url = pageRow.url;
  if (shouldSkipUrl(url)) {
    db.prepare("UPDATE scrape_pages SET status='skipped', note=? WHERE id=?").run("login/private path blocked", pageRow.id);
    counters.skipped++;
    return [];
  }

  const allowed = await isAllowedByRobots(url, USER_AGENT, (robotsUrl) => fetchWithRetry(robotsUrl, config.speed || "normal"));
  if (!allowed) {
    db.prepare("UPDATE scrape_pages SET status='skipped', note=? WHERE id=?").run("blocked by robots.txt", pageRow.id);
    counters.skipped++;
    return [];
  }

  try {
    const response = await fetchWithRetry(url, config.speed || "normal", 0, pageRow.retry_count || 0);
    const text = response.text || "";
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (/captcha|cloudflare|recaptcha|hcaptcha/i.test(text)) {
      db.prepare("UPDATE scrape_pages SET status='skipped', note=? WHERE id=?").run("captcha detected", pageRow.id);
      counters.captcha++;
      return [];
    }

    const leads = extractLeadCandidates(text, url);
    let inserted = 0;
    let duplicates = 0;
    for (const lead of leads) {
      const r = await upsertLead(db, lead, config);
      inserted += r.inserted;
      duplicates += r.duplicate;
      if (lead.profession) upsertSuggestion(db, "industry", lead.profession, 70);
      if (lead.country) upsertSuggestion(db, "country", lead.country, 65);
      upsertSuggestion(db, "source", new URL(url).hostname, 60);
    }

    counters.inserted += inserted;
    counters.duplicates += duplicates;
    counters.pagesDone++;
    db.prepare("UPDATE scrape_pages SET status='done', note=? WHERE id=?").run(`emails:${leads.length}`, pageRow.id);

    const depth = pageRow.depth || 0;
    if (depth >= (config.depthLevel === "deep" ? 3 : config.depthLevel === "medium" ? 2 : 1)) return [];
    return extractLinks(text, url).slice(0, 40);
  } catch (err) {
    const retries = (pageRow.retry_count || 0) + 1;
    if (retries <= MAX_RETRIES) {
      db.prepare("UPDATE scrape_pages SET retry_count=?, status='queued', note=? WHERE id=?").run(retries, err.message?.slice(0, 180), pageRow.id);
    } else {
      db.prepare("UPDATE scrape_pages SET status='failed', note=? WHERE id=?").run(err.message?.slice(0, 180), pageRow.id);
      counters.failed++;
    }
    return [];
  }
}

async function runJob(db, job) {
  const config = parseJsonSafe(job.config_json, {});
  const counters = {
    pagesDone: 0,
    inserted: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
    captcha: 0,
  };

  db.prepare("UPDATE scrape_jobs SET status='running', started_at=?, error_msg=NULL WHERE id=?").run(nowIso(), job.id);

  const seeds = Array.isArray(config.seedUrls) ? config.seedUrls : [];
  for (const seed of seeds) {
    if (!seed) continue;
    db.prepare("INSERT OR IGNORE INTO scrape_pages (job_id, url, depth, status, created_at) VALUES (?, ?, 0, 'queued', ?)")
      .run(job.id, seed, nowIso());
  }

  const maxPages = Math.max(1, Math.min(1000, Number(config.maxPages || 50)));
  let visited = 0;

  while (visited < maxPages) {
    const latest = db.prepare("SELECT status FROM scrape_jobs WHERE id=?").get(job.id);
    if (!latest || latest.status === "cancelled") return;

    const pageRow = db.prepare(`
      SELECT * FROM scrape_pages
      WHERE job_id = ? AND status = 'queued'
      ORDER BY id ASC
      LIMIT 1
    `).get(job.id);
    if (!pageRow) break;

    visited++;
    const nextLinks = await processPage(db, job.id, pageRow, config, counters);
    for (const link of nextLinks) {
      if (shouldSkipUrl(link)) continue;
      db.prepare(`
        INSERT OR IGNORE INTO scrape_pages (job_id, url, depth, status, created_at)
        VALUES (?, ?, ?, 'queued', ?)
      `).run(job.id, link, (pageRow.depth || 0) + 1, nowIso());
    }

    const progress = {
      ...counters,
      scanned: visited,
      maxPages,
      updatedAt: nowIso(),
    };
    db.prepare("UPDATE scrape_jobs SET progress_json=? WHERE id=?").run(JSON.stringify(progress), job.id);
  }

  db.prepare(`
    UPDATE scrape_jobs
    SET status='completed', progress_json=?, finished_at=?
    WHERE id=?
  `).run(
    JSON.stringify({ ...counters, scanned: visited, maxPages, updatedAt: nowIso() }),
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
      SELECT * FROM scrape_jobs
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
  }, 1500);
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
  return db.prepare("SELECT * FROM scrape_jobs ORDER BY id DESC LIMIT ?").all(limit).map((j) => ({
    ...j,
    config: parseJsonSafe(j.config_json, {}),
    progress: parseJsonSafe(j.progress_json, {}),
  }));
}

export function getScrapeJob(id) {
  const db = getDb();
  const job = db.prepare("SELECT * FROM scrape_jobs WHERE id = ?").get(id);
  if (!job) return null;
  const pages = db.prepare("SELECT * FROM scrape_pages WHERE job_id = ? ORDER BY id DESC LIMIT 120").all(id);
  return {
    ...job,
    config: parseJsonSafe(job.config_json, {}),
    progress: parseJsonSafe(job.progress_json, {}),
    pages,
  };
}

export function cancelScrapeJob(id) {
  const db = getDb();
  db.prepare("UPDATE scrape_jobs SET status='cancelled', finished_at=? WHERE id=? AND status IN ('queued','running')")
    .run(nowIso(), id);
}
