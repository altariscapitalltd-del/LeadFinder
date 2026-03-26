const COOKIE_NAME = "leadforge_ai_providers";
const ALLOWED = new Set(["anthropic", "openai", "openrouter", "gemini", "groq", "compatible"]);

export function getProviderCookieName() {
  return COOKIE_NAME;
}

export function parseProviderSession(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(Buffer.from(String(rawValue), "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && ALLOWED.has(String(item.provider || "").toLowerCase()) && String(item.api_key || "").trim())
      .map((item) => ({
        provider: String(item.provider || "").trim().toLowerCase(),
        provider_type: String(item.provider_type || item.provider || "openai").trim().toLowerCase(),
        api_key: String(item.api_key || "").trim(),
        base_url: String(item.base_url || "").trim() || null,
        active: item.active ? 1 : 0,
        updated_at: item.updated_at || new Date().toISOString(),
        session_backed: true,
      }));
  } catch {
    return [];
  }
}

export function serializeProviderSession(providers) {
  const normalized = Array.isArray(providers)
    ? providers
        .filter((item) => item && ALLOWED.has(String(item.provider || "").toLowerCase()) && String(item.api_key || "").trim())
        .map((item) => ({
          provider: String(item.provider || "").trim().toLowerCase(),
          provider_type: String(item.provider_type || item.provider || "openai").trim().toLowerCase(),
          api_key: String(item.api_key || "").trim(),
          base_url: String(item.base_url || "").trim() || null,
          active: item.active ? 1 : 0,
          updated_at: item.updated_at || new Date().toISOString(),
        }))
    : [];
  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

export function upsertSessionProvider(existingProviders, provider) {
  const map = new Map((existingProviders || []).map((item) => [item.provider, item]));
  map.set(provider.provider, {
    ...provider,
    updated_at: new Date().toISOString(),
    active: 1,
  });
  return [...map.values()];
}

export function removeSessionProvider(existingProviders, providerName) {
  return (existingProviders || []).filter((item) => item.provider !== providerName);
}

export function inferProviderFromApiKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return null;
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("AIza")) return "gemini";
  if (key.startsWith("sk-")) return "openai";
  return null;
}

export function validateCompatibleBaseUrl(baseUrl) {
  const value = String(baseUrl || "").trim();
  if (!value) throw new Error("Base URL is required for OpenAI-compatible providers.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Base URL must be a valid https://... URL.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Base URL must start with http:// or https://.");
  }
  return parsed.toString().replace(/\/$/, "");
}
