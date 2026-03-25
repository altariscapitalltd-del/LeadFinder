export const dynamic = "force-dynamic";
// app/api/contacts/route.js
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { classifyEmailType } from "../../../lib/ai.js";
import { parse } from "csv-parse/sync";

// GET /api/contacts?status=new&type=business&country=USA&search=...&page=1&limit=50
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const country = searchParams.get("country");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  const db = getDb();
  let where = ["1=1"];
  let params = [];

  if (status && status !== "all") { where.push("status = ?"); params.push(status); }
  if (type && type !== "all") { where.push("type = ?"); params.push(type); }
  if (country && country !== "all") { where.push("country = ?"); params.push(country); }
  if (search) { where.push("(email LIKE ? OR name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }

  const whereClause = where.join(" AND ");
  const total = db.prepare(`SELECT COUNT(*) as n FROM contacts WHERE ${whereClause}`).get(...params).n;
  const contacts = db.prepare(`SELECT * FROM contacts WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  // Parse tags JSON
  const parsed = contacts.map(c => ({ ...c, tags: JSON.parse(c.tags || "[]") }));

  return NextResponse.json({ contacts: parsed, total, page, pages: Math.ceil(total / limit) });
}

// POST /api/contacts — single contact or CSV bulk
export async function POST(req) {
  const contentType = req.headers.get("content-type") || "";
  const db = getDb();

  // CSV upload
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const text = await file.text();
    if (text.length > 5_000_000) {
      return NextResponse.json({ error: "CSV file too large (max 5MB)" }, { status: 413 });
    }
    let rows;
    try {
      rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
      return NextResponse.json({ error: "Invalid CSV: " + e.message }, { status: 400 });
    }

    let inserted = 0, skipped = 0, errors = [];
    const insert = db.prepare(`
      INSERT OR IGNORE INTO contacts (email, name, country, region, type, source, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const email = (row.email || row.Email || row.EMAIL || "").trim().toLowerCase();
        if (!email || !email.includes("@")) { errors.push(`Invalid email: ${JSON.stringify(row)}`); continue; }

        // Basic email syntax validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; continue; }

        const result = insert.run(
          email,
          row.name || row.Name || row.full_name || null,
          row.country || row.Country || null,
          row.region || row.Region || null,
          classifyEmailType(email),
          "CSV Upload",
          "[]"
        );
        if (result.changes > 0) inserted++;
        else skipped++;
      }
    });

    insertMany(rows);
    return NextResponse.json({ inserted, skipped, errors: errors.slice(0, 10), total: rows.length });
  }

  // Single contact
  const body = await req.json();
  const { email, name, country, region, source, tags, consent_note } = body;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const emailLower = email.trim().toLowerCase();

  // DNC check
  const dnc = db.prepare("SELECT 1 FROM dnc_list WHERE email = ?").get(emailLower);
  if (dnc) return NextResponse.json({ error: "Email is on Do Not Contact list" }, { status: 409 });

  try {
    const result = db.prepare(`
      INSERT INTO contacts (email, name, country, region, type, source, tags, consent_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(emailLower, name || null, country || null, region || null, classifyEmailType(emailLower), source || "Manual", JSON.stringify(tags || []), consent_note || null);

    return NextResponse.json({ id: result.lastInsertRowid, message: "Contact added" });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    throw e;
  }
}

// PATCH /api/contacts — update status/tags/score
export async function PATCH(req) {
  const body = await req.json();
  const { ids, status, tags, score } = body;
  const db = getDb();

  const now = new Date().toISOString();

  if (!ids || !ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (!ids.every((id) => Number.isInteger(id) || /^\d+$/.test(String(id)))) {
    return NextResponse.json({ error: "ids must be numeric" }, { status: 400 });
  }

  const placeholders = ids.map(() => "?").join(",");

  if (status) {
    db.prepare(`UPDATE contacts SET status = ?, updated_at = ? WHERE id IN (${placeholders})`).run(status, now, ...ids);
    // Add to DNC if marked as dnc
    if (status === "dnc") {
      const emails = db.prepare(`SELECT email FROM contacts WHERE id IN (${placeholders})`).all(...ids);
      const addDnc = db.prepare("INSERT OR IGNORE INTO dnc_list (email, reason) VALUES (?, 'user_marked')");
      emails.forEach(r => addDnc.run(r.email));
    }
  }
  if (score !== undefined) {
    db.prepare(`UPDATE contacts SET score = ?, updated_at = ? WHERE id IN (${placeholders})`).run(score, now, ...ids);
  }

  return NextResponse.json({ updated: ids.length });
}

// DELETE /api/contacts
export async function DELETE(req) {
  const body = await req.json();
  const { ids } = body;
  if (!ids?.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (!ids.every((id) => Number.isInteger(id) || /^\d+$/.test(String(id)))) {
    return NextResponse.json({ error: "ids must be numeric" }, { status: 400 });
  }

  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...ids);
  return NextResponse.json({ deleted: ids.length });
}
