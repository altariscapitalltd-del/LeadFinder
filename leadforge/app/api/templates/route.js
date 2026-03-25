// app/api/templates/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";

export async function GET() {
  const db = getDb();
  const templates = db.prepare("SELECT * FROM templates ORDER BY created_at DESC").all();
  return NextResponse.json({ templates });
}

export async function POST(req) {
  const body = await req.json();
  const { name, subject, body_html, body_text, tone } = body;
  if (!name || !subject || !body_html) {
    return NextResponse.json({ error: "name, subject and body_html are required" }, { status: 400 });
  }
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO templates (name, subject, body_html, body_text, tone)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, subject, body_html, body_text || null, tone || "professional");
  return NextResponse.json({ id: result.lastInsertRowid });
}

export async function PATCH(req) {
  const body = await req.json();
  const { id, name, subject, body_html, body_text, tone } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  db.prepare(`
    UPDATE templates SET name=?, subject=?, body_html=?, body_text=?, tone=? WHERE id=?
  `).run(name, subject, body_html, body_text || null, tone || "professional", id);
  return NextResponse.json({ message: "Updated" });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const db = getDb();
  db.prepare("DELETE FROM templates WHERE id = ?").run(id);
  return NextResponse.json({ message: "Deleted" });
}
