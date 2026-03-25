export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));
  const jobId = Number(searchParams.get("jobId") || 0);
  const leads = getDb().prepare(`
    SELECT id, email, name, country, source, source_url, type, classification_confidence, status, score, created_at, scrape_job_id
    FROM contacts
    WHERE source LIKE 'Scraped:%'
      AND (? = 0 OR scrape_job_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(jobId, jobId, limit);
  return NextResponse.json({ leads });
}
