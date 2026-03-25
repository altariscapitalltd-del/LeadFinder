export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));
  const leads = getDb().prepare(`
    SELECT id, email, name, country, source, status, score, created_at
    FROM contacts
    WHERE source LIKE 'Scraped:%'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
  return NextResponse.json({ leads });
}
