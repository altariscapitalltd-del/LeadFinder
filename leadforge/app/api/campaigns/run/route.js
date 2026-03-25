// app/api/campaigns/run/route.js
import { NextResponse } from "next/server";
import { sendCampaignBatch } from "../../../../lib/mailer.js";

export async function POST(req) {
  const { campaignId, batchSize } = await req.json();
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  try {
    const result = await sendCampaignBatch(campaignId, batchSize || 10);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
