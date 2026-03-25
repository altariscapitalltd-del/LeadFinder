export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cancelScrapeJob } from "../../../../../../lib/scraper/queue.js";

export async function POST(_req, { params }) {
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "valid numeric id required" }, { status: 400 });
  }
  cancelScrapeJob(id);
  return NextResponse.json({ message: "cancel requested" });
}
