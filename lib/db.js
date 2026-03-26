// lib/db.js
// Auto-creates leadforge.db with all tables on first run.
import Database from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";
import { assertProductionEnv } from "./env.js";

const DB_PATH = process.env.DATABASE_PATH || (process.env.VERCEL ? "/tmp/leadforge.db" : "./leadforge.db");
const resolved = path.resolve(process.cwd(), DB_PATH);

let _db = null;

export function getDb() {
  if (_db) return _db;
  assertProductionEnv();
  mkdirSync(path.dirname(resolved), { recursive: true });
  _db = new Database(resolved);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("busy_timeout = 5000");
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    -- SMTP accounts the user has configured
    CREATE TABLE IF NOT EXISTS smtp_accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT NOT NULL,
      host        TEXT NOT NULL,
      port        INTEGER NOT NULL DEFAULT 587,
      secure      INTEGER NOT NULL DEFAULT 0,
      user        TEXT NOT NULL,
      password    TEXT NOT NULL,
      from_name   TEXT,
      daily_limit INTEGER NOT NULL DEFAULT 200,
      sent_today  INTEGER NOT NULL DEFAULT 0,
      last_reset  TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- AI provider keys
    CREATE TABLE IF NOT EXISTS ai_settings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      provider        TEXT NOT NULL UNIQUE,
      api_key         TEXT NOT NULL,
      model           TEXT,
      active          INTEGER DEFAULT 0,
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_models (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      provider        TEXT NOT NULL,
      model_id        TEXT NOT NULL,
      label           TEXT,
      category        TEXT DEFAULT 'chat',
      speed_tier      TEXT DEFAULT 'balanced',
      quality_tier    TEXT DEFAULT 'balanced',
      context_window  INTEGER DEFAULT 0,
      input_cost      REAL DEFAULT 0,
      output_cost     REAL DEFAULT 0,
      available       INTEGER DEFAULT 1,
      raw_json        TEXT,
      updated_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, model_id)
    );

    CREATE TABLE IF NOT EXISTS ai_model_stats (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      provider        TEXT NOT NULL,
      model_id        TEXT NOT NULL,
      task_type       TEXT NOT NULL DEFAULT 'chat',
      total_requests  INTEGER NOT NULL DEFAULT 0,
      success_count   INTEGER NOT NULL DEFAULT 0,
      error_count     INTEGER NOT NULL DEFAULT 0,
      avg_latency_ms  REAL NOT NULL DEFAULT 0,
      last_error      TEXT,
      last_success_at TEXT,
      last_error_at   TEXT,
      updated_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(provider, model_id, task_type)
    );

    -- App-level settings (key/value)
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Contacts / leads
    CREATE TABLE IF NOT EXISTS contacts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      email           TEXT NOT NULL UNIQUE,
      name            TEXT,
      type            TEXT DEFAULT 'unknown',   -- personal | business | unknown
      country         TEXT,
      region          TEXT,
      language        TEXT,
      source          TEXT,
      status          TEXT DEFAULT 'new',        -- new|ready|contacted|followup|replied|bounced|unsubscribed|dnc
      score           INTEGER DEFAULT 50,
      tags            TEXT DEFAULT '[]',          -- JSON array
      consent_note    TEXT,
      last_contacted  TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    -- Email templates
    CREATE TABLE IF NOT EXISTS templates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      subject     TEXT NOT NULL,
      body_html   TEXT NOT NULL,
      body_text   TEXT,
      tone        TEXT DEFAULT 'professional',
      variables   TEXT DEFAULT '[]',
      use_count   INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Campaigns
    CREATE TABLE IF NOT EXISTS campaigns (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      template_id     INTEGER REFERENCES templates(id),
      segment_filter  TEXT DEFAULT '{}',  -- JSON filter object
      smtp_account_id INTEGER REFERENCES smtp_accounts(id),
      status          TEXT DEFAULT 'draft', -- draft|active|paused|completed|stopped
      daily_limit     INTEGER DEFAULT 100,
      send_delay_min  INTEGER DEFAULT 30,
      send_delay_max  INTEGER DEFAULT 90,
      min_days_between INTEGER DEFAULT 3,
      schedule_time   TEXT DEFAULT '09:00',
      sent_count      INTEGER DEFAULT 0,
      delivered_count INTEGER DEFAULT 0,
      opened_count    INTEGER DEFAULT 0,
      replied_count   INTEGER DEFAULT 0,
      bounced_count   INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );

    -- Individual email send log
    CREATE TABLE IF NOT EXISTS email_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id   INTEGER REFERENCES campaigns(id),
      contact_id    INTEGER REFERENCES contacts(id),
      smtp_account_id INTEGER REFERENCES smtp_accounts(id),
      subject       TEXT,
      status        TEXT DEFAULT 'queued', -- queued|sent|delivered|opened|replied|bounced|failed
      error_msg     TEXT,
      message_id    TEXT,
      sent_at       TEXT,
      opened_at     TEXT,
      replied_at    TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    -- Automation rules
    CREATE TABLE IF NOT EXISTS automations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      trigger_type  TEXT NOT NULL,  -- schedule | event
      schedule      TEXT,
      event_type    TEXT,
      action_type   TEXT NOT NULL,
      action_config TEXT DEFAULT '{}',
      active        INTEGER DEFAULT 1,
      last_run      TEXT,
      next_run      TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    -- Unsubscribe / DNC list
    CREATE TABLE IF NOT EXISTS dnc_list (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT NOT NULL UNIQUE,
      reason     TEXT DEFAULT 'unsubscribed',
      added_at   TEXT DEFAULT (datetime('now'))
    );

    -- Scraping jobs queue
    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      status        TEXT NOT NULL DEFAULT 'queued', -- queued|running|completed|failed|cancelled
      config_json   TEXT NOT NULL,
      progress_json TEXT DEFAULT '{}',
      error_msg     TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      started_at    TEXT,
      finished_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS scrape_pages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id        INTEGER REFERENCES scrape_jobs(id) ON DELETE CASCADE,
      url           TEXT NOT NULL,
      depth         INTEGER DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'queued', -- queued|done|failed|skipped
      retry_count   INTEGER DEFAULT 0,
      note          TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(job_id, url)
    );

    CREATE TABLE IF NOT EXISTS scrape_job_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id        INTEGER NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
      event_type    TEXT NOT NULL DEFAULT 'progress_update',
      level         TEXT NOT NULL DEFAULT 'info',
      message       TEXT NOT NULL,
      meta_json     TEXT DEFAULT '{}',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scrape_suggestions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      kind          TEXT NOT NULL, -- source|country|industry|quality
      value         TEXT NOT NULL,
      confidence    INTEGER DEFAULT 50,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scrape_source_stats (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      domain        TEXT NOT NULL UNIQUE,
      hits          INTEGER NOT NULL DEFAULT 0,
      inserted      INTEGER NOT NULL DEFAULT 0,
      duplicates    INTEGER NOT NULL DEFAULT 0,
      failures      INTEGER NOT NULL DEFAULT 0,
      avg_relevance REAL NOT NULL DEFAULT 0,
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_threads (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id     INTEGER NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
      role          TEXT NOT NULL,
      content       TEXT NOT NULL,
      tool_name     TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    -- Insert default settings
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('unsubscribe_link', '1'),
      ('dnc_enforced', '1'),
      ('spam_check', '1'),
      ('consent_tracking', '1'),
      ('send_delay_random', '1'),
      ('default_from_name', 'LeadForge');
  `);

  ensureColumn(db, "ai_settings", "base_url", "TEXT");
  ensureColumn(db, "ai_settings", "provider_type", "TEXT DEFAULT 'managed'");
  ensureColumn(db, "ai_settings", "models_json", "TEXT");
  ensureColumn(db, "ai_settings", "meta_json", "TEXT");
  ensureColumn(db, "ai_settings", "last_discovered_at", "TEXT");
  ensureColumn(db, "ai_settings", "last_error", "TEXT");
  ensureColumn(db, "contacts", "scrape_job_id", "INTEGER");
  ensureColumn(db, "contacts", "source_url", "TEXT");
  ensureColumn(db, "contacts", "classification_confidence", "REAL DEFAULT 0");
  ensureColumn(db, "scrape_pages", "priority", "REAL DEFAULT 0");
  ensureColumn(db, "scrape_pages", "parent_url", "TEXT");
  ensureColumn(db, "scrape_pages", "page_kind", "TEXT");
  ensureColumn(db, "scrape_job_events", "event_type", "TEXT DEFAULT 'progress_update'");
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
