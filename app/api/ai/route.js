export const dynamic = "force-dynamic";
// app/api/ai/route.js
import { NextResponse } from "next/server";
import { generateEmail, scoreContact, generateReply } from "../../../lib/ai.js";
import { getDb } from "../../../lib/db.js";

export async function POST(req) {
  const body = await req.json();
  const { action } = body;

  try {
    if (action === "generate_email") {
      const { goal, tone } = body;
      if (!goal) return NextResponse.json({ error: "goal required" }, { status: 400 });
      const result = await generateEmail({ goal, tone });
      return NextResponse.json(result);
    }

    if (action === "score_contact") {
      const { contactId } = body;
      const db = getDb();
      const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
      if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      const result = await scoreContact(contact);
      db.prepare("UPDATE contacts SET score = ? WHERE id = ?").run(result.score, contactId);
      return NextResponse.json(result);
    }

    if (action === "generate_reply") {
      const { originalEmail, senderName, tone } = body;
      const reply = await generateReply({ originalEmail, senderName, tone });
      return NextResponse.json({ reply });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/ai — list configured providers
export async function GET() {
  const db = getDb();
  const providers = db.prepare("SELECT id, provider, model, active, updated_at FROM ai_settings ORDER BY id").all();
  return NextResponse.json({ providers });
}
