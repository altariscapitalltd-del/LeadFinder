export const dynamic = "force-dynamic";
// app/api/automations/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";

export async function GET() {
  const db = getDb();
  const automations = db.prepare("SELECT * FROM automations ORDER BY created_at DESC").all();
  return NextResponse.json({ automations });
}

export async function POST(req) {
  const body = await req.json();
  const { name, trigger_type, schedule, event_type, action_type, action_config } = body;
  if (!name || !action_type) return NextResponse.json({ error: "name and action_type required" }, { status: 400 });
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO automations (name, trigger_type, schedule, event_type, action_type, action_config, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(name, trigger_type || "schedule", schedule || null, event_type || null, action_type, action_config || "{}");
  return NextResponse.json({ id: result.lastInsertRowid });
}

export async function PATCH(req) {
  const body = await req.json();
  const { id, active, last_run, next_run, ...rest } = body;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return NextResponse.json({ error: "valid numeric id required" }, { status: 400 });
  const db = getDb();
  if (active !== undefined) db.prepare("UPDATE automations SET active = ? WHERE id = ?").run(active, numericId);
  if (last_run) db.prepare("UPDATE automations SET last_run = ? WHERE id = ?").run(last_run, numericId);
  if (next_run) db.prepare("UPDATE automations SET next_run = ? WHERE id = ?").run(next_run, numericId);
  return NextResponse.json({ message: "Updated" });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "valid numeric id required" }, { status: 400 });
  const db = getDb();
  db.prepare("DELETE FROM automations WHERE id = ?").run(id);
  return NextResponse.json({ message: "Deleted" });
}
