export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db.js";
import { refreshProviderModels } from "../../../../lib/ai.js";
import { getProviderCookieName, inferProviderFromApiKey, parseProviderSession, removeSessionProvider, serializeProviderSession, upsertSessionProvider, validateCompatibleBaseUrl } from "../../../../lib/provider-session.js";

const ALLOWED = new Set(["anthropic", "openai", "openrouter", "gemini", "groq", "compatible"]);

function shouldUseSecureCookies(req) {
  const forwardedProto = String(req.headers.get("x-forwarded-proto") || "").toLowerCase();
  const host = String(req.headers.get("host") || "").toLowerCase();
  if (host.includes("localhost") || host.includes("127.0.0.1")) return false;
  return process.env.NODE_ENV === "production" || forwardedProto === "https";
}

export async function POST(req) {
  const body = await req.json();
  const requestedProvider = String(body.provider || "").trim().toLowerCase();
  const apiKey = String(body.api_key || "").trim();
  const inferredProvider = inferProviderFromApiKey(apiKey);
  const provider = inferredProvider && requestedProvider !== "compatible" ? inferredProvider : requestedProvider;
  const providerType = String(body.provider_type || provider || "openai").trim().toLowerCase();
  let normalizedBaseUrl = null;
  try {
    normalizedBaseUrl = provider === "compatible" ? validateCompatibleBaseUrl(body.base_url) : String(body.base_url || "").trim() || null;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!provider || !apiKey) {
    return NextResponse.json({ error: "provider and api_key required" }, { status: 400 });
  }
  if (!ALLOWED.has(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const sessionProviders = parseProviderSession(req.cookies.get(getProviderCookieName())?.value);
  const nextSessionProviders = upsertSessionProvider(sessionProviders, {
    provider,
    provider_type: providerType,
    api_key: apiKey,
    base_url: normalizedBaseUrl,
    active: 1,
  });
  const warningParts = [];

  try {
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
    `).run(provider, apiKey, normalizedBaseUrl, providerType);
  } catch (error) {
    warningParts.push(`Server database unavailable, using secure session storage instead.`);
  }

  try {
    const models = await refreshProviderModels(provider, nextSessionProviders);
    const response = NextResponse.json({
      message: `${provider} connected`,
      modelsDiscovered: models.length,
      ...(warningParts.length ? { warning: warningParts.join(" ") } : {}),
      ...(inferredProvider && inferredProvider !== requestedProvider ? { inferredProvider } : {}),
    });
    response.cookies.set(getProviderCookieName(), serializeProviderSession(nextSessionProviders), {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(req),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    try {
      const db = getDb();
      db.prepare("UPDATE ai_settings SET last_error = ?, updated_at = datetime('now') WHERE provider = ?").run(error.message, provider);
    } catch {}
    const response = NextResponse.json({
      message: `${provider} saved`,
      warning: [...warningParts, error.message].join(" "),
      ...(inferredProvider && inferredProvider !== requestedProvider ? { inferredProvider } : {}),
    });
    response.cookies.set(getProviderCookieName(), serializeProviderSession(nextSessionProviders), {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(req),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const provider = String(searchParams.get("provider") || "").trim().toLowerCase();
  if (!provider || !ALLOWED.has(provider)) {
    return NextResponse.json({ error: "valid provider is required" }, { status: 400 });
  }
  try {
    const db = getDb();
    db.prepare("DELETE FROM ai_settings WHERE provider = ?").run(provider);
    db.prepare("DELETE FROM ai_models WHERE provider = ?").run(provider);
    db.prepare("DELETE FROM ai_model_stats WHERE provider = ?").run(provider);
  } catch {}
  const sessionProviders = parseProviderSession(req.cookies.get(getProviderCookieName())?.value);
  const response = NextResponse.json({ message: "Provider removed" });
  response.cookies.set(getProviderCookieName(), serializeProviderSession(removeSessionProvider(sessionProviders, provider)), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
