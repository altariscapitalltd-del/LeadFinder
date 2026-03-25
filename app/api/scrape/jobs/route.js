export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { enqueueScrapeJob, listScrapeJobs, startScrapeWorker } from "../../../../lib/scraper/queue.js";

startScrapeWorker();

export async function GET() {
  const jobs = listScrapeJobs(50);
  return NextResponse.json({ jobs });
}

export async function POST(req) {
  const body = await req.json();
  const {
    seedUrls = [],
    country = "all",
    region = "all",
    industry = "all",
    maxPages = 50,
    depthLevel = "medium",
    speed = "normal",
  } = body || {};

  if (!Array.isArray(seedUrls) || seedUrls.length === 0) {
    return NextResponse.json({ error: "seedUrls array is required" }, { status: 400 });
  }
  const cleaned = seedUrls.map((u) => String(u || "").trim()).filter(Boolean);
  if (!cleaned.length) {
    return NextResponse.json({ error: "at least one valid seed URL is required" }, { status: 400 });
  }

  const id = enqueueScrapeJob({
    seedUrls: cleaned,
    country,
    region,
    industry,
    maxPages: Math.max(1, Math.min(1000, Number(maxPages || 50))),
    depthLevel: ["shallow", "medium", "deep"].includes(depthLevel) ? depthLevel : "medium",
    speed: ["slow", "normal", "aggressive"].includes(speed) ? speed : "normal",
  });

  return NextResponse.json({ id, message: "Scrape job queued" });
}
