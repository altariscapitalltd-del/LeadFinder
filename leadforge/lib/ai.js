// lib/ai.js
// Unified AI provider. Reads active provider from DB, falls back to env vars.

import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./db.js";

function getActiveProvider() {
  try {
    const db = getDb();
    const active = db.prepare("SELECT * FROM ai_settings WHERE active = 1 LIMIT 1").get();
    if (active?.api_key) return active;
  } catch {}
  // Fall back to env
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", api_key: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-20250514" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", api_key: process.env.OPENAI_API_KEY, model: "gpt-4o" };
  }
  if (process.env.GROQ_API_KEY) {
    return { provider: "groq", api_key: process.env.GROQ_API_KEY, model: "llama-3.3-70b-versatile" };
  }
  return null;
}

// ── Core completion function ──────────────────────────────────────────────────
export async function complete({ system, prompt, maxTokens = 2000 }) {
  const provider = getActiveProvider();
  if (!provider) throw new Error("No AI provider configured. Add an API key in Settings → AI Providers.");

  if (provider.provider === "anthropic") {
    const client = new Anthropic({ apiKey: provider.api_key });
    const response = await client.messages.create({
      model: provider.model || "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content.find(b => b.type === "text")?.text || "";
  }

  if (provider.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model: provider.model || "gpt-4o",
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "OpenAI error");
    return data.choices[0].message.content;
  }

  if (provider.provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.api_key}` },
      body: JSON.stringify({
        model: provider.model || "llama-3.3-70b-versatile",
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Groq error");
    return data.choices[0].message.content;
  }

  throw new Error(`Unknown provider: ${provider.provider}`);
}

// ── Generate email ─────────────────────────────────────────────────────────────
export async function generateEmail({ goal, tone = "professional" }) {
  const text = await complete({
    system: `You are an expert cold email copywriter. Return ONLY valid JSON (no markdown fences) with keys: subject, body_html, body_text, variables_used.
body_html must be valid HTML email. Use {{name}}, {{email}}, {{country}}, {{company}} variables where natural.
Tone: ${tone}. Keep emails concise and high-converting.`,
    prompt: `Write a cold outreach email for this goal: ${goal}`,
  });
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Score a contact ────────────────────────────────────────────────────────────
export async function scoreContact(contact) {
  const text = await complete({
    system: `You are a lead scoring AI. Score a contact 0-100 based on how likely they are to convert. Return ONLY a JSON object: {"score": number, "reason": "brief reason"}.`,
    prompt: `Contact: ${JSON.stringify(contact)}`,
    maxTokens: 200,
  });
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Generate AI reply ─────────────────────────────────────────────────────────
export async function generateReply({ originalEmail, senderName, tone = "professional" }) {
  return await complete({
    system: `You are an email reply assistant. Write a ${tone} reply. Be concise (3-4 sentences). Return only the reply text — no subject line, no preamble.`,
    prompt: `Reply to this email from ${senderName}: "${originalEmail}"`,
    maxTokens: 400,
  });
}

// ── Classify email type ────────────────────────────────────────────────────────
export function classifyEmailType(email) {
  const personalDomains = ["gmail.com","yahoo.com","outlook.com","hotmail.com","icloud.com","protonmail.com","proton.me","aol.com","live.com","msn.com","ymail.com"];
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "unknown";
  return personalDomains.includes(domain) ? "personal" : "business";
}
