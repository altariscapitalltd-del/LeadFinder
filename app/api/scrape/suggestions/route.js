export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getScrapeSuggestions } from "../../../../lib/scraper/suggestions.js";

export async function GET() {
  const suggestions = getScrapeSuggestions(8);
  return NextResponse.json({ suggestions });
}
