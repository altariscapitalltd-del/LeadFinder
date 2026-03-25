export const dynamic = "force-dynamic";
// app/api/campaigns/run/route.js
import { NextResponse } from "next/server";
import { sendCampaignBatch } from "../../../../lib/mailer.js";

export async function POST(req) {
  const { campaignId, batchSize } = await req.json();
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  const batch = Math.min(100, Math.max(1, Number(batchSize || 10)));
  if (!Number.isInteger(Number(campaignId))) {
    return NextResponse.json({ error: "campaignId must be numeric" }, { status: 400 });
  }

  try {
    const result = await sendCampaignBatch(Number(campaignId), batch);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
