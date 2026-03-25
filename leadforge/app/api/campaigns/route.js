// app/api/campaigns/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";

export async function GET() {
  const db = getDb();
  const campaigns = db.prepare(`
    SELECT c.*, t.name as template_name, s.user as smtp_user, s.label as smtp_label
    FROM campaigns c
    LEFT JOIN templates t ON c.template_id = t.id
    LEFT JOIN smtp_accounts s ON c.smtp_account_id = s.id
    ORDER BY c.created_at DESC
  `).all();
  return NextResponse.json({ campaigns });
}

export async function POST(req) {
  const body = await req.json();
  const { name, template_id, smtp_account_id, daily_limit, send_delay_min, send_delay_max, schedule_time } = body;

  if (!name || !template_id || !smtp_account_id) {
    return NextResponse.json({ error: "name, template_id and smtp_account_id are required" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO campaigns (name, template_id, smtp_account_id, daily_limit, send_delay_min, send_delay_max, schedule_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, template_id, smtp_account_id, daily_limit || 100, send_delay_min || 30, send_delay_max || 90, schedule_time || "09:00");

  return NextResponse.json({ id: result.lastInsertRowid, message: "Campaign created" });
}

export async function PATCH(req) {
  const body = await req.json();
  const { id, status, ...rest } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  if (status) {
    db.prepare("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?").run(status, new Date().toISOString(), id);
  }
  return NextResponse.json({ message: "Updated" });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const db = getDb();
  db.prepare("DELETE FROM campaigns WHERE id = ?").run(id);
  return NextResponse.json({ message: "Deleted" });
}
