export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db.js";
import { refreshProviderModels } from "../../../../lib/ai.js";

const ALLOWED = new Set(["anthropic", "openai", "openrouter", "gemini", "groq", "compatible"]);

export async function POST(req) {
  const body = await req.json();
  const provider = String(body.provider || "").trim().toLowerCase();
  const apiKey = String(body.api_key || "").trim();
  const baseUrl = String(body.base_url || "").trim();
  const providerType = String(body.provider_type || provider || "openai").trim().toLowerCase();

  if (!provider || !apiKey) {
    return NextResponse.json({ error: "provider and api_key required" }, { status: 400 });
  }
  if (!ALLOWED.has(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO ai_settings (provider, api_key, model, active, updated_at, base_url, provider_type, last_error)
    VALUES (?, ?, NULL, 1, datetime('now'), ?, ?, NULL)
    ON CONFLICT(provider) DO UPDATE SET
      api_key = excluded.api_key,
      active = 1,
      updated_at = excluded.updated_at,
      base_url = excluded.base_url,
      provider_type = excluded.provider_type,
      last_error = NULL
  `).run(provider, apiKey, baseUrl || null, providerType);

  try {
    const models = await refreshProviderModels(provider);
    return NextResponse.json({ message: `${provider} connected`, modelsDiscovered: models.length });
  } catch (error) {
    db.prepare("UPDATE ai_settings SET last_error = ?, updated_at = datetime('now') WHERE provider = ?").run(error.message, provider);
    return NextResponse.json({ message: `${provider} saved`, warning: error.message });
  }
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const provider = String(searchParams.get("provider") || "").trim().toLowerCase();
  if (!provider || !ALLOWED.has(provider)) {
    return NextResponse.json({ error: "valid provider is required" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("DELETE FROM ai_settings WHERE provider = ?").run(provider);
  db.prepare("DELETE FROM ai_models WHERE provider = ?").run(provider);
  db.prepare("DELETE FROM ai_model_stats WHERE provider = ?").run(provider);
  return NextResponse.json({ message: "Provider removed" });
}
