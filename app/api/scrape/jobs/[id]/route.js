export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getScrapeJob, startScrapeWorker } from "../../../../../lib/scraper/queue.js";

startScrapeWorker();

export async function GET(_req, { params }) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "valid numeric id required" }, { status: 400 });
  }
  const job = getScrapeJob(id);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  return NextResponse.json({ job });
}
