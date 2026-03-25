// app/api/smtp/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { testSmtpConnection } from "../../../lib/mailer.js";

export async function GET() {
  const db = getDb();
  const accounts = db.prepare("SELECT id, label, host, port, secure, user, from_name, daily_limit, sent_today, active, created_at FROM smtp_accounts ORDER BY id DESC").all();
  return NextResponse.json({ accounts });
}

export async function POST(req) {
  const body = await req.json();
  const { label, host, port, secure, user, password, from_name, daily_limit } = body;

  if (!host || !user || !password) {
    return NextResponse.json({ error: "host, user and password are required" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO smtp_accounts (label, host, port, secure, user, password, from_name, daily_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(label || user, host, port || 587, secure ? 1 : 0, user, password, from_name || "", daily_limit || 200);

  return NextResponse.json({ id: result.lastInsertRowid, message: "SMTP account saved" });
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const db = getDb();
  db.prepare("DELETE FROM smtp_accounts WHERE id = ?").run(id);
  return NextResponse.json({ message: "Deleted" });
}
