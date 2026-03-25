import Database from "better-sqlite3";
import postgres from "postgres";
import path from "path";

const sqlitePath = path.resolve(process.cwd(), process.env.DATABASE_PATH || "./leadforge.db");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required for PostgreSQL migration.");
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const sql = postgres(databaseUrl, { ssl: "require" });

const TABLES = [
  "smtp_accounts",
  "ai_settings",
  "ai_models",
  "ai_model_stats",
  "settings",
  "contacts",
  "templates",
  "campaigns",
  "email_log",
  "automations",
  "dnc_list",
  "scrape_jobs",
  "scrape_pages",
  "scrape_job_events",
  "scrape_suggestions",
  "scrape_source_stats",
  "agent_threads",
  "agent_messages",
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS smtp_accounts (
  id BIGINT PRIMARY KEY,
  label TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  secure INTEGER NOT NULL DEFAULT 0,
  user_email TEXT NOT NULL,
  password TEXT NOT NULL,
  from_name TEXT,
  daily_limit INTEGER NOT NULL DEFAULT 200,
  sent_today INTEGER NOT NULL DEFAULT 0,
  last_reset TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS ai_settings (
  id BIGINT PRIMARY KEY,
  provider TEXT UNIQUE NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT,
  active INTEGER DEFAULT 0,
  updated_at TEXT,
  base_url TEXT,
  provider_type TEXT,
  models_json TEXT,
  meta_json TEXT,
  last_discovered_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS ai_models (
  id BIGINT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  label TEXT,
  category TEXT DEFAULT 'chat',
  speed_tier TEXT DEFAULT 'balanced',
  quality_tier TEXT DEFAULT 'balanced',
  context_window INTEGER DEFAULT 0,
  input_cost DOUBLE PRECISION DEFAULT 0,
  output_cost DOUBLE PRECISION DEFAULT 0,
  available INTEGER DEFAULT 1,
  raw_json TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS ai_model_stats (
  id BIGINT PRIMARY KEY,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_error TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  type TEXT,
  country TEXT,
  region TEXT,
  language TEXT,
  source TEXT,
  status TEXT,
  score INTEGER,
  tags TEXT,
  consent_note TEXT,
  last_contacted TEXT,
  created_at TEXT,
  updated_at TEXT,
  scrape_job_id BIGINT,
  source_url TEXT,
  classification_confidence DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS templates (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  tone TEXT,
  variables TEXT,
  use_count INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS campaigns (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id BIGINT,
  segment_filter TEXT,
  smtp_account_id BIGINT,
  status TEXT,
  daily_limit INTEGER,
  send_delay_min INTEGER,
  send_delay_max INTEGER,
  min_days_between INTEGER,
  schedule_time TEXT,
  sent_count INTEGER,
  delivered_count INTEGER,
  opened_count INTEGER,
  replied_count INTEGER,
  bounced_count INTEGER,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS email_log (
  id BIGINT PRIMARY KEY,
  campaign_id BIGINT,
  contact_id BIGINT,
  smtp_account_id BIGINT,
  subject TEXT,
  status TEXT,
  error_msg TEXT,
  message_id TEXT,
  sent_at TEXT,
  opened_at TEXT,
  replied_at TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS automations (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  schedule TEXT,
  event_type TEXT,
  action_type TEXT NOT NULL,
  action_config TEXT,
  active INTEGER,
  last_run TEXT,
  next_run TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS dnc_list (
  id BIGINT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  reason TEXT,
  added_at TEXT
);
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id BIGINT PRIMARY KEY,
  status TEXT NOT NULL,
  config_json TEXT NOT NULL,
  progress_json TEXT,
  error_msg TEXT,
  created_at TEXT,
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS scrape_pages (
  id BIGINT PRIMARY KEY,
  job_id BIGINT,
  url TEXT NOT NULL,
  depth INTEGER,
  status TEXT,
  retry_count INTEGER,
  note TEXT,
  created_at TEXT,
  priority DOUBLE PRECISION,
  parent_url TEXT,
  page_kind TEXT
);
CREATE TABLE IF NOT EXISTS scrape_job_events (
  id BIGINT PRIMARY KEY,
  job_id BIGINT NOT NULL,
  event_type TEXT,
  level TEXT,
  message TEXT,
  meta_json TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS scrape_suggestions (
  id BIGINT PRIMARY KEY,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS scrape_source_stats (
  id BIGINT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  hits INTEGER,
  inserted INTEGER,
  duplicates INTEGER,
  failures INTEGER,
  avg_relevance DOUBLE PRECISION,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS agent_threads (
  id BIGINT PRIMARY KEY,
  title TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS agent_messages (
  id BIGINT PRIMARY KEY,
  thread_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_name TEXT,
  created_at TEXT
);
`;

function normalizeRow(table, row) {
  if (table === "smtp_accounts") {
    return { ...row, user_email: row.user, user: undefined };
  }
  return row;
}

async function insertRow(client, table, row) {
  const columns = Object.keys(row).filter((key) => row[key] !== undefined);
  const values = columns.map((column) => row[column]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  await client.unsafe(`INSERT INTO "${table}" (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
}

async function main() {
  await sql.unsafe(SCHEMA);

  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) continue;
    const normalized = rows.map((row) => normalizeRow(table, row));
    await sql.begin(async (trx) => {
      for (const row of normalized) {
        await insertRow(trx, table, row);
      }
    });
    console.log(`Migrated ${rows.length} rows from ${table}`);
  }

  await sql.end();
  sqlite.close();
  console.log("PostgreSQL migration complete.");
}

main().catch(async (error) => {
  console.error(error);
  await sql.end({ timeout: 1 }).catch(() => {});
  sqlite.close();
  process.exit(1);
});
