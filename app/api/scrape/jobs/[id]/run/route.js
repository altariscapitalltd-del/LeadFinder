export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getScrapeJob, processScrapeJobSlice } from "../../../../../../lib/scraper/queue.js";

export async function POST(req, { params }) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "valid numeric id required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const pageBudget = Math.max(1, Math.min(8, Number(body?.pageBudget || 3)));
  const job = await processScrapeJobSlice(id, pageBudget);
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  return NextResponse.json({ job: getScrapeJob(id) || job });
}

