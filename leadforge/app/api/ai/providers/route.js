// app/api/ai/providers/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db.js";

export async function POST(req) {
  const body = await req.json();
  const { provider, api_key, model, make_active } = body;

  if (!provider || !api_key) {
    return NextResponse.json({ error: "provider and api_key required" }, { status: 400 });
  }

  const db = getDb();

  // Upsert the provider
  db.prepare(`
    INSERT INTO ai_settings (provider, api_key, model, active, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      api_key = excluded.api_key,
      model = excluded.model,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).run(provider, api_key, model || null, make_active ? 1 : 0);

  // If making active, deactivate others
  if (make_active) {
    db.prepare("UPDATE ai_settings SET active = 0 WHERE provider != ?").run(provider);
    db.prepare("UPDATE ai_settings SET active = 1 WHERE provider = ?").run(provider);
  }

  return NextResponse.json({ message: `${provider} API key saved${make_active ? " and activated" : ""}` });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider");
  const db = getDb();
  db.prepare("DELETE FROM ai_settings WHERE provider = ?").run(provider);
  return NextResponse.json({ message: "Provider removed" });
}
