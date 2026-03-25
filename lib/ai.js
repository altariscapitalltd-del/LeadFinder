import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db.js";

const DEFAULT_MODELS = {
  anthropic: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  openai: ["gpt-4o-mini", "gpt-4o"],
  openrouter: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-exp:free"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  compatible: [],
};

const PROVIDER_META = {
  anthropic: { label: "Anthropic", type: "anthropic" },
  openai: { label: "OpenAI", type: "openai" },
  openrouter: { label: "OpenRouter", type: "openai" },
  gemini: { label: "Gemini", type: "gemini" },
  groq: { label: "Groq", type: "openai" },
  compatible: { label: "OpenAI Compatible", type: "openai" },
};

function nowIso() {
  return new Date().toISOString();
}

function parseJsonSafe(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getEnvProviders() {
  const envProviders = [];
  if (process.env.ANTHROPIC_API_KEY) envProviders.push({ provider: "anthropic", provider_type: "anthropic", api_key: process.env.ANTHROPIC_API_KEY, active: 1 });
  if (process.env.OPENAI_API_KEY) envProviders.push({ provider: "openai", provider_type: "openai", api_key: process.env.OPENAI_API_KEY, active: 1 });
  if (process.env.OPENROUTER_API_KEY) envProviders.push({ provider: "openrouter", provider_type: "openai", api_key: process.env.OPENROUTER_API_KEY, base_url: "https://openrouter.ai/api/v1", active: 1 });
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) envProviders.push({ provider: "gemini", provider_type: "gemini", api_key: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY, active: 1 });
  if (process.env.GROQ_API_KEY) envProviders.push({ provider: "groq", provider_type: "openai", api_key: process.env.GROQ_API_KEY, base_url: "https://api.groq.com/openai/v1", active: 1 });
  return envProviders;
}

function getConfiguredProviders() {
  const db = getDb();
  const fromDb = db.prepare("SELECT * FROM ai_settings ORDER BY active DESC, updated_at DESC").all();
  const map = new Map();
  for (const item of [...fromDb, ...getEnvProviders()]) {
    const key = item.provider;
    if (!map.has(key)) {
      map.set(key, {
        ...item,
        provider_type: item.provider_type || PROVIDER_META[item.provider]?.type || "openai",
        base_url: item.base_url || defaultBaseUrl(item.provider),
        models_json: item.models_json || null,
      });
    }
  }
  return [...map.values()];
}

function defaultBaseUrl(provider) {
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  if (provider === "groq") return "https://api.groq.com/openai/v1";
  if (provider === "compatible") return "";
  return "https://api.openai.com/v1";
}

function classifyModel(modelId) {
  const id = String(modelId || "").toLowerCase();
  const fast = /mini|flash|haiku|instant|8b|small/.test(id);
  const reasoning = /o1|o3|opus|sonnet|reason|70b|pro/.test(id);
  const cheap = /free|mini|haiku|instant|flash|8b/.test(id);
  const longContext = /128k|200k|1m|long/.test(id);
  return {
    category: "chat",
    speed_tier: fast ? "fast" : reasoning ? "balanced" : "standard",
    quality_tier: reasoning ? "high" : fast ? "fast" : "balanced",
    context_window: longContext ? 200000 : fast ? 64000 : 128000,
    cheap,
  };
}

function normalizeDiscoveredModels(provider, payload) {
  if (provider === "gemini") {
    const models = Array.isArray(payload.models) ? payload.models : [];
    return models
      .filter((model) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
      .map((model) => {
        const modelId = String(model.name || "").replace(/^models\//, "");
        const tags = classifyModel(modelId);
        return { model_id: modelId, label: model.displayName || modelId, ...tags, raw_json: model };
      });
  }

  const models = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  return models.map((model) => {
    const modelId = model.id || model.name;
    const tags = classifyModel(modelId);
    return {
      model_id: modelId,
      label: model.name || model.id || modelId,
      context_window: model.context_length || model.contextWindow || tags.context_window,
      input_cost: Number(model.pricing?.prompt || model.input_cost || 0),
      output_cost: Number(model.pricing?.completion || model.output_cost || 0),
      ...tags,
      raw_json: model,
    };
  });
}

async function fetchProviderModels(setting) {
  if (setting.provider === "anthropic") {
    return DEFAULT_MODELS.anthropic.map((model_id) => ({ model_id, label: model_id, ...classifyModel(model_id), raw_json: {} }));
  }

  if (setting.provider === "gemini") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(setting.api_key)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Gemini model discovery failed");
    return normalizeDiscoveredModels("gemini", data);
  }

  const baseUrl = setting.base_url || defaultBaseUrl(setting.provider);
  const headers = {
    Authorization: `Bearer ${setting.api_key}`,
    "Content-Type": "application/json",
  };
  if (setting.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "LeadForge AI";
  }
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Model discovery failed");
  return normalizeDiscoveredModels(setting.provider, data);
}

function storeDiscoveredModels(setting, models) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO ai_models (provider, model_id, label, category, speed_tier, quality_tier, context_window, input_cost, output_cost, available, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(provider, model_id) DO UPDATE SET
      label = excluded.label,
      category = excluded.category,
      speed_tier = excluded.speed_tier,
      quality_tier = excluded.quality_tier,
      context_window = excluded.context_window,
      input_cost = excluded.input_cost,
      output_cost = excluded.output_cost,
      available = 1,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    for (const model of models) {
      insert.run(
        setting.provider,
        model.model_id,
        model.label,
        model.category || "chat",
        model.speed_tier || "balanced",
        model.quality_tier || "balanced",
        Number(model.context_window || 0),
        Number(model.input_cost || 0),
        Number(model.output_cost || 0),
        JSON.stringify(model.raw_json || {}),
        nowIso()
      );
    }
    db.prepare("UPDATE ai_settings SET models_json = ?, last_discovered_at = ?, last_error = NULL, updated_at = ? WHERE provider = ?")
      .run(JSON.stringify(models.map((item) => item.model_id)), nowIso(), nowIso(), setting.provider);
  });
  tx();
}

export async function refreshProviderModels(provider) {
  const setting = getConfiguredProviders().find((item) => item.provider === provider);
  if (!setting) throw new Error("Provider not configured");
  const models = await fetchProviderModels(setting);
  storeDiscoveredModels(setting, models);
  return models;
}

async function ensureModelsLoaded(setting) {
  const db = getDb();
  const cached = db.prepare("SELECT * FROM ai_models WHERE provider = ? AND available = 1 ORDER BY updated_at DESC").all(setting.provider);
  if (cached.length) return cached;

  try {
    const models = await fetchProviderModels(setting);
    storeDiscoveredModels(setting, models);
    return db.prepare("SELECT * FROM ai_models WHERE provider = ? AND available = 1 ORDER BY updated_at DESC").all(setting.provider);
  } catch {
    const defaults = (DEFAULT_MODELS[setting.provider] || []).map((modelId) => ({
      provider: setting.provider,
      model_id: modelId,
      label: modelId,
      ...classifyModel(modelId),
      context_window: classifyModel(modelId).context_window,
      input_cost: 0,
      output_cost: 0,
      available: 1,
      raw_json: "{}",
      updated_at: nowIso(),
    }));
    if (defaults.length) {
      storeDiscoveredModels(setting, defaults);
      return db.prepare("SELECT * FROM ai_models WHERE provider = ? AND available = 1 ORDER BY updated_at DESC").all(setting.provider);
    }
    return [];
  }
}

function scoreCandidate(taskType, model, stat) {
  const latency = Number(stat?.avg_latency_ms || 800);
  const total = Number(stat?.total_requests || 0);
  const successRate = total > 0 ? Number(stat.success_count || 0) / total : 0.92;
  const errorPenalty = Number(stat?.error_count || 0) * 0.08;
  const qualityBoost = taskType === "agent" || taskType === "coding"
    ? model.quality_tier === "high" ? 0.36 : model.quality_tier === "balanced" ? 0.2 : 0.08
    : taskType === "chat"
      ? model.speed_tier === "fast" ? 0.28 : 0.16
      : 0.18;
  const contextBoost = Number(model.context_window || 0) >= 100000 ? 0.12 : 0;
  const costPenalty = Number(model.input_cost || 0) + Number(model.output_cost || 0);
  return (successRate * 1.4) + qualityBoost + contextBoost - (latency / 5000) - errorPenalty - costPenalty;
}

async function getCandidates(taskType) {
  const db = getDb();
  const settings = getConfiguredProviders();
  const candidates = [];
  for (const setting of settings) {
    const models = await ensureModelsLoaded(setting);
    for (const model of models) {
      const stat = db.prepare("SELECT * FROM ai_model_stats WHERE provider = ? AND model_id = ? AND task_type = ?")
        .get(setting.provider, model.model_id, taskType);
      candidates.push({
        setting,
        model,
        stat,
        score: scoreCandidate(taskType, model, stat),
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function recordModelOutcome({ provider, modelId, taskType, latencyMs, ok, errorMessage }) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM ai_model_stats WHERE provider = ? AND model_id = ? AND task_type = ?").get(provider, modelId, taskType);
  if (!existing) {
    db.prepare(`
      INSERT INTO ai_model_stats (provider, model_id, task_type, total_requests, success_count, error_count, avg_latency_ms, last_error, last_success_at, last_error_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      provider,
      modelId,
      taskType,
      ok ? 1 : 0,
      ok ? 0 : 1,
      latencyMs,
      ok ? null : String(errorMessage || ""),
      ok ? nowIso() : null,
      ok ? null : nowIso(),
      nowIso()
    );
    return;
  }

  const totalRequests = Number(existing.total_requests || 0) + 1;
  const avgLatency = ((Number(existing.avg_latency_ms || 0) * Number(existing.total_requests || 0)) + latencyMs) / totalRequests;
  db.prepare(`
    UPDATE ai_model_stats
    SET total_requests = ?,
        success_count = ?,
        error_count = ?,
        avg_latency_ms = ?,
        last_error = ?,
        last_success_at = ?,
        last_error_at = ?,
        updated_at = ?
    WHERE provider = ? AND model_id = ? AND task_type = ?
  `).run(
    totalRequests,
    Number(existing.success_count || 0) + (ok ? 1 : 0),
    Number(existing.error_count || 0) + (ok ? 0 : 1),
    avgLatency,
    ok ? existing.last_error : String(errorMessage || ""),
    ok ? nowIso() : existing.last_success_at,
    ok ? existing.last_error_at : nowIso(),
    nowIso(),
    provider,
    modelId,
    taskType
  );
}

async function callAnthropic({ apiKey, model, system, messages, maxTokens }) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    system,
    max_tokens: maxTokens,
    messages: messages.map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content })),
  });
  return response.content.find((block) => block.type === "text")?.text || "";
}

async function callOpenAICompatible({ baseUrl, apiKey, model, system, messages, maxTokens, temperature, provider }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "LeadForge AI";
  }
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...messages,
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `${provider} request failed`);
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini({ apiKey, model, system, messages, maxTokens }) {
  const prompt = [
    system ? `System:\n${system}` : "",
    ...messages.map((message) => `${message.role === "assistant" ? "Assistant" : "User"}:\n${message.content}`),
  ].filter(Boolean).join("\n\n");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { maxOutputTokens: maxTokens },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini request failed");
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

async function runCandidate(candidate, payload) {
  const provider = candidate.setting.provider;
  if (provider === "anthropic") {
    return callAnthropic({
      apiKey: candidate.setting.api_key,
      model: candidate.model.model_id,
      system: payload.system,
      messages: payload.messages,
      maxTokens: payload.maxTokens,
    });
  }
  if (provider === "gemini") {
    return callGemini({
      apiKey: candidate.setting.api_key,
      model: candidate.model.model_id,
      system: payload.system,
      messages: payload.messages,
      maxTokens: payload.maxTokens,
    });
  }
  return callOpenAICompatible({
    baseUrl: candidate.setting.base_url || defaultBaseUrl(provider),
    apiKey: candidate.setting.api_key,
    model: candidate.model.model_id,
    system: payload.system,
    messages: payload.messages,
    maxTokens: payload.maxTokens,
    temperature: payload.temperature,
    provider,
  });
}

export async function complete({ system = "", prompt = "", messages, maxTokens = 2000, taskType = "chat", temperature = 0.4 }) {
  const preparedMessages = Array.isArray(messages) && messages.length
    ? messages
    : [{ role: "user", content: prompt }];
  const candidates = await getCandidates(taskType);
  if (!candidates.length) throw new Error("No AI providers configured. Add provider API keys in Settings.");

  const errors = [];
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const started = Date.now();
      try {
        const text = await runCandidate(candidate, { system, messages: preparedMessages, maxTokens, temperature });
        recordModelOutcome({
          provider: candidate.setting.provider,
          modelId: candidate.model.model_id,
          taskType,
          latencyMs: Date.now() - started,
          ok: true,
        });
        return text;
      } catch (error) {
        recordModelOutcome({
          provider: candidate.setting.provider,
          modelId: candidate.model.model_id,
          taskType,
          latencyMs: Date.now() - started,
          ok: false,
          errorMessage: error.message,
        });
        errors.push(`${candidate.setting.provider}:${candidate.model.model_id} => ${error.message}`);
      }
    }
  }

  throw new Error(`All AI providers failed. ${errors.slice(0, 5).join(" | ")}`);
}

export function listProviderStatus() {
  const db = getDb();
  const providers = getConfiguredProviders();
  return providers.map((provider) => {
    const models = db.prepare("SELECT provider, model_id, label, speed_tier, quality_tier, context_window, updated_at FROM ai_models WHERE provider = ? AND available = 1 ORDER BY updated_at DESC").all(provider.provider);
    const stats = db.prepare("SELECT provider, model_id, task_type, total_requests, success_count, error_count, avg_latency_ms, updated_at FROM ai_model_stats WHERE provider = ? ORDER BY updated_at DESC LIMIT 20").all(provider.provider);
    return {
      provider: provider.provider,
      provider_type: provider.provider_type || provider.provider,
      active: provider.active ? 1 : 0,
      base_url: provider.base_url || null,
      last_discovered_at: provider.last_discovered_at || null,
      last_error: provider.last_error || null,
      models,
      stats,
    };
  });
}

export async function generateEmail({ goal, tone = "professional" }) {
  const text = await complete({
    system: `You are an expert cold email copywriter. Return ONLY valid JSON with keys: subject, body_html, body_text, variables_used.
body_html must be valid HTML email. Use {{name}}, {{email}}, {{country}}, {{company}} variables where natural.
Tone: ${tone}. Keep emails concise and high-converting.`,
    prompt: `Write a cold outreach email for this goal: ${goal}`,
    taskType: "writing",
  });
  return JSON.parse(String(text || "").replace(/```json|```/g, "").trim());
}

export async function scoreContact(contact) {
  const text = await complete({
    system: `You are a lead scoring AI. Return ONLY JSON: {"score": number, "reason": "brief reason"}.`,
    prompt: `Contact: ${JSON.stringify(contact)}`,
    maxTokens: 250,
    taskType: "analysis",
  });
  return JSON.parse(String(text || "").replace(/```json|```/g, "").trim());
}

export async function generateReply({ originalEmail, senderName, tone = "professional" }) {
  return complete({
    system: `You are an email reply assistant. Write a ${tone} reply. Be concise. Return only the reply text.`,
    prompt: `Reply to this email from ${senderName}: "${originalEmail}"`,
    maxTokens: 400,
    taskType: "chat",
  });
}

export function classifyEmailType(email) {
  const personalDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "protonmail.com", "proton.me", "aol.com", "live.com", "msn.com", "ymail.com"];
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "unknown";
  return personalDomains.includes(domain) ? "personal" : "business";
}
