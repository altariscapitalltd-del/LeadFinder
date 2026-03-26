export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateEmail, scoreContact, generateReply, listProviderStatus } from "../../../lib/ai.js";
import { getDb } from "../../../lib/db.js";
import { getProviderCookieName, parseProviderSession } from "../../../lib/provider-session.js";

export async function POST(req) {
  const body = await req.json();
  const { action } = body;
  const sessionProviders = parseProviderSession(req.cookies.get(getProviderCookieName())?.value);

  try {
    if (action === "generate_email") {
      const { goal, tone } = body;
      if (!goal) return NextResponse.json({ error: "goal required" }, { status: 400 });
      const result = await generateEmail({ goal, tone, sessionProviders });
      return NextResponse.json(result);
    }

    if (action === "score_contact") {
      const { contactId } = body;
      const db = getDb();
      const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
      if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      const result = await scoreContact(contact, sessionProviders);
      db.prepare("UPDATE contacts SET score = ? WHERE id = ?").run(result.score, contactId);
      return NextResponse.json(result);
    }

    if (action === "generate_reply") {
      const { originalEmail, senderName, tone } = body;
      const reply = await generateReply({ originalEmail, senderName, tone, sessionProviders });
      return NextResponse.json({ reply });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/ai — list configured providers
export async function GET() {
  const sessionProviders = parseProviderSession(cookies().get(getProviderCookieName())?.value);
  let routingStats = [];
  try {
    const db = getDb();
    routingStats = db.prepare(`
      SELECT provider, model_id, task_type, total_requests, success_count, error_count, avg_latency_ms, updated_at
      FROM ai_model_stats
      ORDER BY updated_at DESC
      LIMIT 25
    `).all();
  } catch {
    routingStats = [];
  }
  const providers = listProviderStatus(sessionProviders);
  return NextResponse.json({ providers, routingStats });
}
