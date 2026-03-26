export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";

const BOOLEAN_KEYS = new Set([
  "unsubscribe_link",
  "dnc_enforced",
  "spam_check",
  "consent_tracking",
  "send_delay_random",
  "bounce_handling",
]);

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = Object.fromEntries(rows.map((row) => [row.key, BOOLEAN_KEYS.has(row.key) ? row.value === "1" : row.value]));
  return NextResponse.json({ settings });
}

export async function PATCH(req) {
  const body = await req.json();
  const entries = Object.entries(body || {}).filter(([key]) => BOOLEAN_KEYS.has(key));
  if (!entries.length) return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const tx = db.transaction((items) => {
    for (const [key, value] of items) {
      upsert.run(key, value ? "1" : "0");
    }
  });
  tx(entries);
  return NextResponse.json({ ok: true });
}
