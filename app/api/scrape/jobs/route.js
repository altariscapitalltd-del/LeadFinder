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
    keyword = "",
    seedUrls = [],
    country = "all",
    region = "all",
    industry = "all",
    emailFilter = "all",
    targetEmails = 100,
    maxPages = 50,
    depthLevel = "medium",
    speed = "normal",
    generateEmails = false,
    generationMode = "off",
  } = body || {};

  const cleaned = (Array.isArray(seedUrls) ? seedUrls : []).map((u) => String(u || "").trim()).filter(Boolean);
  const cleanedKeyword = String(keyword || "").trim();
  if (!cleaned.length && !cleanedKeyword) {
    return NextResponse.json({ error: "Provide at least one seed URL or a keyword" }, { status: 400 });
  }

  const id = enqueueScrapeJob({
    keyword: cleanedKeyword,
    seedUrls: cleaned,
    country,
    region,
    industry,
    emailFilter: ["all", "gmail_only", "personal", "business"].includes(emailFilter) ? emailFilter : "all",
    targetEmails: Math.max(10, Math.min(5000, Number(targetEmails || 100))),
    maxPages: Math.max(1, Math.min(1000, Number(maxPages || 50))),
    depthLevel: ["shallow", "medium", "deep"].includes(depthLevel) ? depthLevel : "medium",
    speed: ["slow", "normal", "aggressive"].includes(speed) ? speed : "normal",
    generateEmails: Boolean(generateEmails),
    generationMode: ["off", "roles"].includes(generationMode) ? generationMode : "off",
  });

  return NextResponse.json({ id, message: "Scrape job queued" });
}
